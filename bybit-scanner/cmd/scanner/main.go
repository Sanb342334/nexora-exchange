package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/execution"
	"bybit-scanner/internal/health"
	"bybit-scanner/internal/logger"
	"bybit-scanner/internal/market"
	"bybit-scanner/internal/notifier"
	"bybit-scanner/internal/paper"
	"bybit-scanner/internal/processlock"
	"bybit-scanner/internal/risk"
	"bybit-scanner/internal/strategy"
	"bybit-scanner/internal/traders"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	loggers, err := logger.Init(cfg.LogDir)
	if err != nil {
		panic(err)
	}

	release, err := processlock.Acquire(cfg.LogDir)
	if err != nil {
		loggers.Errors.Fatal().Err(err).Msg("refusing to start duplicate scanner")
	}
	defer release()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go cfg.ReloadLoop(ctx)

	rest := market.NewRESTClient(cfg, loggers)
	symbols := market.LoadSymbols(ctx, rest, cfg, loggers)
	if len(symbols) == 0 {
		loggers.Errors.Fatal().Msg("empty symbol list — check symbols.list or SYMBOLS env")
	}
	market.TunePollIntervals(cfg, len(symbols))

	market.TunePollIntervals(cfg, len(symbols))

	store := analyzer.NewStore()
	btcTracker := analyzer.NewBTCTracker()
	for _, sym := range symbols {
		store.Ensure(sym)
	}

	detector := analyzer.NewDetector(cfg, btcTracker)
	stratEngine := strategy.NewEngine(cfg, detector)
	healthTracker := health.New()
	healthTracker.StartMinuteReset(ctx)
	journal := paper.New(cfg, cfg.LogDir)
	yamlCfg := cfg.Snapshot()
	riskFlags := risk.LoadRuntimeFlags(yamlCfg.Risk.Account.DemoEquityUSDT)
	traderMgr := traders.NewManager(cfg, yamlCfg.Risk, riskFlags, cfg.LogDir)
	demoTrader := execution.NewDemoTrader(loggers)
	traderMgr.SetDemoExecutor(demoTrader)
	notify := notifier.New(cfg, loggers, healthTracker, journal)
	notify.SetTraderManager(traderMgr)
	notify.SetDemoTrader(demoTrader)
	notify.SetSymbolCount(len(symbols))
	notify.Start(ctx, 3)
	if traderMgr.DemoAutotradeEnabled() {
		go reconcileDemoTrades(ctx, demoTrader, traderMgr, loggers)
	}

	ws := market.NewWSManager(cfg, loggers, healthTracker, symbols)
	ws.Start(ctx)

	oiPoller := market.NewOIPoller(rest, store, cfg, loggers, symbols)
	oiPoller.Start(ctx)

	lsPoller := market.NewLSPoller(rest, store, cfg, loggers, symbols)
	lsPoller.Start(ctx)

	go runHealthMonitor(ctx, healthTracker, notify, loggers)

	mode := "LIVE"
	if cfg.DryRun {
		mode = "DRY_RUN"
	}
	tradingMode := string(riskFlags.Mode)
	loggers.Scanner.Info().
		Str("mode", mode).
		Str("trading_mode", tradingMode).
		Bool("risk_enabled", yamlCfg.Risk.Enabled).
		Str("version", market.BuildVersion).
		Int("symbols", len(symbols)).
		Bool("strategy_enabled", stratEngine.Enabled()).
		Bool("demo_api", demoTrader.Configured()).
		Bool("traders_enabled", traderMgr.Enabled()).
		Bool("demo_autotrade", traderMgr.DemoAutotradeEnabled()).
		Msg("bybit pump/dump scanner started")

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		processEvents(ctx, ws.Events(), store, btcTracker, detector, stratEngine, traderMgr, notify, cfg, loggers)
	}()

	<-ctx.Done()
	loggers.Scanner.Info().Msg("shutdown signal received")

	ws.Stop()
	oiPoller.Stop()
	lsPoller.Stop()
	stop()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		loggers.Scanner.Warn().Msg("event processor shutdown timeout")
	}

	notify.Stop()
	loggers.Scanner.Info().Msg("scanner stopped")
}

func processEvents(
	ctx context.Context,
	events <-chan market.MarketEvent,
	store *analyzer.Store,
	btc *analyzer.BTCTracker,
	detector *analyzer.Detector,
	stratEngine *strategy.Engine,
	traderMgr *traders.Manager,
	notify *notifier.Notifier,
	cfg *config.Config,
	log *logger.Loggers,
) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-events:
			if !ok {
				return
			}
			handleEvent(ev, store, btc, detector, stratEngine, traderMgr, notify, cfg, log)
		}
	}
}

func handleEvent(
	ev market.MarketEvent,
	store *analyzer.Store,
	btc *analyzer.BTCTracker,
	detector *analyzer.Detector,
	stratEngine *strategy.Engine,
	traderMgr *traders.Manager,
	notify *notifier.Notifier,
	cfg *config.Config,
	log *logger.Loggers,
) {
	if cfg.IsBlacklisted(ev.Symbol) || !cfg.IsAllowed(ev.Symbol) {
		return
	}

	st := store.Ensure(ev.Symbol)

	switch ev.Type {
	case market.EventKline:
		st.UpdateKline(ev.Kline)
		if ev.Symbol == analyzer.BTCSymbol {
			price := ev.Kline.Close
			if price <= 0 {
				price = ev.Kline.Open
			}
			btc.Update(price, ev.ReceivedAt)
		}
	case market.EventTicker:
		st.UpdateTicker(ev.Price, ev.Bid, ev.Ask, ev.Funding, ev.OpenInterest, ev.ReceivedAt)
		if ev.Symbol == analyzer.BTCSymbol && ev.Price > 0 {
			btc.Update(ev.Price, ev.ReceivedAt)
		}
	case market.EventTrade:
		st.UpdateTrade(ev.TradeSide, ev.TradeValue, ev.ReceivedAt)
	case market.EventLiquidation:
		st.UpdateLiquidation(ev.LiqValue, ev.ReceivedAt)
	default:
		return
	}

	now := ev.ReceivedAt

	if traderMgr != nil && traderMgr.Enabled() {
		if price := st.LastPrice(); price > 0 {
			traderMgr.UpdatePrice(ev.Symbol, price)
		}
	}

	if stratEngine.Enabled() {
		for _, outcome := range stratEngine.Process(ev.Symbol, st, now) {
			if !outcome.Tradeable {
				notify.EnqueueWatch(outcome.Signal)
				continue
			}
			if !st.CanAlert(cfg.AlertCooldown, outcome.Signal.Triggers, now) {
				continue
			}
			st.MarkAlert(outcome.Signal.Triggers, now)
			yamlCfg := cfg.Snapshot()
			results := traderMgr.Process(outcome.Signal, st.RecentCandles(15), yamlCfg.Paper.SlippagePct)
			logTraderResults(log, results)
			if !anyTraderIn(results) {
				for _, r := range results {
					log.Scanner.Info().
						Str("symbol", outcome.Signal.Symbol).
						Int("score", outcome.Signal.Score).
						Str("alert", outcome.Signal.AlertType).
						Str("trader", r.Profile.Name).
						Str("reason", r.Reason).
						Msg("trader skipped")
				}
				continue
			}
			notify.EnqueueMultiTrader(results)
		}
		return
	}

	sig, ok := detector.Evaluate(ev.Symbol, st, ev.ReceivedAt)
	if !ok {
		return
	}

	if !st.CanAlert(cfg.AlertCooldown, sig.Triggers, now) {
		return
	}

	st.MarkAlert(sig.Triggers, now)

	yamlCfg := cfg.Snapshot()
	results := traderMgr.Process(*sig, st.RecentCandles(15), yamlCfg.Paper.SlippagePct)
	logTraderResults(log, results)
	if !anyTraderIn(results) {
		return
	}
	notify.EnqueueMultiTrader(results)
}

func anyTraderIn(results []traders.Result) bool {
	for _, r := range results {
		if !r.Skipped {
			return true
		}
	}
	return false
}

func logTraderResults(log *logger.Loggers, results []traders.Result) {
	for _, r := range results {
		if r.Skipped {
			continue
		}
		rec := r.Rec
		log.Signals.Info().
			Str("trader", r.Profile.ID).
			Str("trader_name", r.Profile.Name).
			Str("symbol", rec.Signal.Symbol).
			Int("score", rec.Signal.Score).
			Str("alert", rec.Signal.AlertType).
			Str("side", string(rec.Side)).
			Int("leverage", rec.Leverage).
			Float64("notional", rec.NotionalUSDT).
			Bool("demo", r.DemoExecuted).
			Str("demo_order_id", r.DemoOrderID).
			Msg("trader entry")
	}
}

func reconcileDemoTrades(ctx context.Context, demo *execution.DemoTrader, manager *traders.Manager, log *logger.Loggers) {
	ticker := time.NewTicker(45 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			requestCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
			closed, err := demo.ClosedPnL(requestCtx, 100)
			cancel()
			if err != nil {
				log.Errors.Warn().Err(err).Msg("demo reconciliation failed")
				continue
			}
			manager.ReconcileClosed(closed)
		}
	}
}

func runHealthMonitor(ctx context.Context, h *health.Tracker, n *notifier.Notifier, log *logger.Loggers) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	alerted := false
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if h.IsStale(2 * time.Minute) {
				if !alerted {
					age := h.LastEventAge()
					msg := fmt.Sprintf("Нет данных уже %s. Проверьте WS-соединение.", age.Truncate(time.Second))
					n.SendHealthAlert(ctx, msg)
					log.Errors.Warn().Dur("last_event_age", age).Msg("scanner data stale")
					alerted = true
				}
			} else {
				alerted = false
			}
		}
	}
}

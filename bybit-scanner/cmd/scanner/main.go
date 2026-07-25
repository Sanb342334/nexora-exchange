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
	"bybit-scanner/internal/health"
	"bybit-scanner/internal/logger"
	"bybit-scanner/internal/market"
	"bybit-scanner/internal/notifier"
	"bybit-scanner/internal/paper"
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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go cfg.ReloadLoop(ctx)

	rest := market.NewRESTClient(cfg, loggers)
	symbols, err := rest.FetchActiveUSDTPairs(ctx, cfg.MinVolume24H)
	if err != nil {
		loggers.Errors.Fatal().Err(err).Msg("failed to load symbols")
	}

	store := analyzer.NewStore()
	btcTracker := analyzer.NewBTCTracker()
	for _, sym := range symbols {
		store.Ensure(sym)
	}

	detector := analyzer.NewDetector(cfg, btcTracker)
	healthTracker := health.New()
	journal := paper.New(cfg, cfg.LogDir)
	notify := notifier.New(cfg, loggers, healthTracker, journal)
	notify.Start(ctx, 3)

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
	loggers.Scanner.Info().
		Str("mode", mode).
		Int("symbols", len(symbols)).
		Int("min_score", cfg.Snapshot().Thresholds.MinScore).
		Msg("bybit pump/dump scanner started")

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		processEvents(ctx, ws.Events(), store, btcTracker, detector, notify, cfg, loggers)
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
			handleEvent(ev, store, btc, detector, notify, cfg, log)
		}
	}
}

func handleEvent(
	ev market.MarketEvent,
	store *analyzer.Store,
	btc *analyzer.BTCTracker,
	detector *analyzer.Detector,
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
	sig, ok := detector.Evaluate(ev.Symbol, st, ev.ReceivedAt)
	if !ok {
		return
	}

	if !st.CanAlert(cfg.AlertCooldown, sig.Triggers, now) {
		return
	}

	st.MarkAlert(sig.Triggers, now)
	notify.Enqueue(*sig)
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

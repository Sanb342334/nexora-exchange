package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/carry"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/execution"
	"bybit-scanner/internal/health"
	"bybit-scanner/internal/indicators"
	"bybit-scanner/internal/logger"
	"bybit-scanner/internal/market"
	"bybit-scanner/internal/momentum"
	"bybit-scanner/internal/notifier"
	"bybit-scanner/internal/paper"
	"bybit-scanner/internal/processlock"
	"bybit-scanner/internal/quality"
	"bybit-scanner/internal/risk"
	"bybit-scanner/internal/signals"
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
	instanceLock, err := processlock.Acquire(cfg.LogDir)
	if err != nil {
		loggers.Errors.Fatal().Err(err).Msg("refusing to start duplicate scanner; Telegram polling will not start")
	}
	defer instanceLock.Release()
	loggers.Scanner.Info().
		Str("instance_id", instanceLock.InstanceID).
		Int("pid", instanceLock.PID).
		Str("started_at", instanceLock.StartedAt.Format(time.RFC3339)).
		Int("local_instances", processlock.LocalInstanceCount(cfg.LogDir)).
		Msg("scanner singleton lock acquired")

	signalLedger, err := signals.Open(filepath.Join(cfg.LogDir, "signals.db"))
	if err != nil {
		loggers.Errors.Warn().Err(err).Msg("signal ledger disabled")
	} else {
		defer signalLedger.Close()
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if signalLedger != nil {
		signals.NewOutcomeWorker(signalLedger, 2*time.Minute).Start(ctx)
	}

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
	btcContext := market.NewBTCContext(120)
	orderbooks := market.NewOrderBookStore()
	for _, sym := range symbols {
		store.Ensure(sym)
	}

	detector := analyzer.NewDetector(cfg, btcTracker)
	stratEngine := strategy.NewEngine(cfg, detector)
	momentumEngine := momentum.NewEngine(cfg)
	indicatorEngine := indicators.NewEngine(cfg)
	qualityEngine := quality.NewDefault()
	healthTracker := health.New()
	healthTracker.SetInstance(
		instanceLock.InstanceID,
		instanceLock.StartedAt,
		processlock.LocalInstanceCount(cfg.LogDir),
	)
	healthTracker.StartMinuteReset(ctx)
	journal := paper.New(cfg, cfg.LogDir)
	yamlCfg := cfg.Snapshot()
	var basisStore *carry.BasisStore
	var carryJournal *carry.Journal
	if yamlCfg.Carry.Enabled {
		basisStore = carry.NewBasisStore()
		carryJournal = carry.NewJournal(cfg.LogDir)
		market.NewSpotPoller(rest, basisStore, loggers, symbols).Start(ctx)
	}
	riskFlags := risk.LoadRuntimeFlags(yamlCfg.Risk.Account.DemoEquityUSDT)
	traderMgr := traders.NewManager(cfg, yamlCfg.Risk, riskFlags, cfg.LogDir)
	demoTrader := execution.NewDemoTrader(loggers, cfg.LogDir)
	demoTrader.SetAdaptiveExitPolicy(yamlCfg.AdaptiveExit)
	traderMgr.SetDemoExecutor(demoTrader)
	traderMgr.RestoreDemoPositions()
	execQueue := execution.NewQueue(2, 128)
	execQueue.Start(ctx)
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
		Str("instance_id", instanceLock.InstanceID).
		Str("started_at", instanceLock.StartedAt.Format(time.RFC3339)).
		Int("local_instances", processlock.LocalInstanceCount(cfg.LogDir)).
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
		processEvents(ctx, ws.Events(), store, btcTracker, btcContext, orderbooks, detector, stratEngine, momentumEngine, indicatorEngine, qualityEngine, traderMgr, notify, execQueue, basisStore, carryJournal, signalLedger, cfg, loggers)
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
	execQueue.Stop()
	loggers.Scanner.Info().Str("instance_id", instanceLock.InstanceID).Msg("scanner stopped")
}

func processEvents(
	ctx context.Context,
	events <-chan market.MarketEvent,
	store *analyzer.Store,
	btc *analyzer.BTCTracker,
	btcContext *market.BTCContext,
	orderbooks *market.OrderBookStore,
	detector *analyzer.Detector,
	stratEngine *strategy.Engine,
	momentumEngine *momentum.Engine,
	indicatorEngine *indicators.Engine,
	qualityEngine *quality.Engine,
	traderMgr *traders.Manager,
	notify *notifier.Notifier,
	execQueue *execution.Queue,
	basisStore *carry.BasisStore,
	carryJournal *carry.Journal,
	signalLedger *signals.Repository,
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
			handleEvent(ev, store, btc, btcContext, orderbooks, detector, stratEngine, momentumEngine, indicatorEngine, qualityEngine, traderMgr, notify, execQueue, basisStore, carryJournal, signalLedger, cfg, log)
		}
	}
}

func handleEvent(
	ev market.MarketEvent,
	store *analyzer.Store,
	btc *analyzer.BTCTracker,
	btcContext *market.BTCContext,
	orderbooks *market.OrderBookStore,
	detector *analyzer.Detector,
	stratEngine *strategy.Engine,
	momentumEngine *momentum.Engine,
	indicatorEngine *indicators.Engine,
	qualityEngine *quality.Engine,
	traderMgr *traders.Manager,
	notify *notifier.Notifier,
	execQueue *execution.Queue,
	basisStore *carry.BasisStore,
	carryJournal *carry.Journal,
	signalLedger *signals.Repository,
	cfg *config.Config,
	log *logger.Loggers,
) {
	if cfg.IsBlacklisted(ev.Symbol) || !cfg.IsAllowed(ev.Symbol) {
		return
	}

	st := store.Ensure(ev.Symbol)

	switch ev.Type {
	case market.EventKline:
		st.UpdateKlineAt(ev.Kline, ev.ReceivedAt)
		if indicatorEngine != nil && indicatorEngine.Enabled() && (ev.KlineInterval == "5" || ev.KlineInterval == "15") {
			indicatorEngine.UpdateKline(ev.Symbol, ev.KlineInterval, ev.Kline)
		}
		if ev.Symbol == analyzer.BTCSymbol {
			btcContext.Update(ev.KlineInterval, ev.Kline)
			price := ev.Kline.Close
			if price <= 0 {
				price = ev.Kline.Open
			}
			btc.Update(price, ev.ReceivedAt)
		}
	case market.EventTicker:
		st.UpdateTicker(ev.Price, ev.Bid, ev.Ask, ev.Funding, ev.OpenInterest, ev.ReceivedAt)
		recordSignalMark(signalLedger, ev.Symbol, ev.Price, ev.ExchangeAt, log)
		recordCarryOpportunity(ev, st, basisStore, carryJournal, traderMgr, notify, execQueue, signalLedger, cfg, log)
		if ev.Symbol == analyzer.BTCSymbol && ev.Price > 0 {
			btc.Update(ev.Price, ev.ReceivedAt)
		}
	case market.EventTrade:
		st.UpdateTrade(ev.TradeSide, ev.TradeValue, ev.ReceivedAt)
	case market.EventLiquidation:
		st.UpdateLiquidation(ev.LiqValue, ev.ReceivedAt)
	case market.EventOrderbook:
		orderbooks.Apply(ev.Book)
		// Book updates are shadow-only and must not retrigger legacy detection.
		return
	default:
		return
	}

	now := ev.ReceivedAt

	// This pipeline is intentionally evaluated independently of legacy
	// detector/FADE output and remains ledger-only while paper_only is true.
	if indicatorEngine != nil && indicatorEngine.Enabled() && ev.Type == market.EventKline && ev.KlineInterval == "5" && ev.Kline.Confirmed {
		if decision := indicatorEngine.Evaluate(ev.Symbol, st, now); decision != nil && decision.Signal != nil {
			recordIndicatorDecision(signalLedger, decision, log)
			enqueueTrade(execQueue, traderMgr, notify, signalLedger, cfg, log, *decision.Signal, st.RecentCandles(15))
		}
	}

	if momentumEngine != nil && momentumEngine.Enabled() {
		if decision := momentumEngine.Evaluate(ev.Symbol, st, btcContext, orderbooks, now); decision != nil {
			recordMomentumDecision(signalLedger, decision, cfg, log)
		}
	}

	if traderMgr != nil && traderMgr.Enabled() {
		if price := st.LastPrice(); price > 0 {
			traderMgr.SetAdaptiveExitPolicy(cfg.Snapshot().AdaptiveExit)
			traderMgr.UpdatePrice(ev.Symbol, price)
		}
	}

	if stratEngine.Enabled() {
		for _, outcome := range stratEngine.Process(ev.Symbol, st, now) {
			recordSignal(signalLedger, outcome.Signal, st, qualityEngine, btcContext, cfg, log)
			if !outcome.Tradeable {
				recordDecision(signalLedger, outcome.Signal.SignalID, "DISPOSITION", "WATCH", nil, now, log)
				notify.EnqueueWatch(outcome.Signal)
				continue
			}
			if !st.CanAlert(cfg.AlertCooldown, outcome.Signal.Triggers, now) {
				recordDecision(signalLedger, outcome.Signal.SignalID, signals.DecisionCooldown, "REJECTED", "alert cooldown", now, log)
				continue
			}
			st.MarkAlert(outcome.Signal.Triggers, now)
			enqueueTrade(execQueue, traderMgr, notify, signalLedger, cfg, log, outcome.Signal, st.RecentCandles(15))
		}
		return
	}

	sig, ok := detector.Evaluate(ev.Symbol, st, ev.ReceivedAt)
	if !ok {
		return
	}
	recordSignal(signalLedger, *sig, st, qualityEngine, btcContext, cfg, log)

	if !st.CanAlert(cfg.AlertCooldown, sig.Triggers, now) {
		recordDecision(signalLedger, sig.SignalID, signals.DecisionCooldown, "REJECTED", "alert cooldown", now, log)
		return
	}

	st.MarkAlert(sig.Triggers, now)

	enqueueTrade(execQueue, traderMgr, notify, signalLedger, cfg, log, *sig, st.RecentCandles(15))
}

func recordCarryOpportunity(
	ev market.MarketEvent,
	st *analyzer.SymbolState,
	basis *carry.BasisStore,
	journal *carry.Journal,
	traderMgr *traders.Manager,
	notify *notifier.Notifier,
	execQueue *execution.Queue,
	signalLedger *signals.Repository,
	cfg *config.Config,
	log *logger.Loggers,
) {
	if basis == nil || journal == nil {
		return
	}
	basis.UpdatePerp(ev.Symbol, carry.Quote{
		Bid: ev.Bid, Ask: ev.Ask, Last: ev.Price, Funding: ev.Funding, UpdatedAt: ev.ReceivedAt,
	})
	carryCfg := cfg.Snapshot().Carry
	if !carryCfg.PaperEnabled {
		return
	}
	op, ok := basis.Evaluate(ev.Symbol, carryCfg, ev.ReceivedAt)
	if !ok {
		return
	}
	if err := journal.Record(op); err != nil {
		log.Errors.Warn().Err(err).Str("symbol", ev.Symbol).Msg("carry opportunity journal failed")
		return
	}
	log.Scanner.Info().
		Str("symbol", ev.Symbol).
		Float64("basis_bps", op.BasisBps).
		Float64("net_bps", op.ExpectedNetBps).
		Msg("paper carry opportunity")
	if traderMgr == nil || !traderMgr.Enabled() {
		return
	}
	vol := 0.0
	if st != nil {
		s := st.SnapshotQuality(ev.Symbol, ev.ReceivedAt)
		vol = s.NormalizedVolumeUSDT
	}
	sig := carry.SignalFromOpportunity(op, vol, ev.ReceivedAt)
	enqueueTrade(execQueue, traderMgr, notify, signalLedger, cfg, log, sig, st.RecentCandles(15))
}

func recordIndicatorDecision(ledger *signals.Repository, decision *indicators.Decision, log *logger.Loggers) {
	if ledger == nil || decision == nil || decision.Signal == nil {
		return
	}
	sig := decision.Signal
	err := ledger.RecordSignal(context.Background(), signals.SignalRecord{
		ID: decision.SignalID, OccurredAt: sig.Timestamp, Symbol: sig.Symbol,
		Direction: sig.TradeAction, Phase: sig.AlertType, Detector: indicators.DetectorIdentity,
		Price: sig.Price,
		Explanation: map[string]any{
			"setup": sig.SetupType, "votes_5m": decision.Votes5m, "votes_15m": decision.Votes15m,
			"reasons": decision.Reasons,
		},
	})
	if err != nil {
		log.Errors.Warn().Err(err).Str("signal_id", decision.SignalID).Msg("indicator ledger record failed")
	}
}

func enqueueTrade(queue *execution.Queue, traderMgr *traders.Manager, notify *notifier.Notifier, signalLedger *signals.Repository, cfg *config.Config, log *logger.Loggers, sig analyzer.Signal, candles []analyzer.Candle) {
	if queue.Submit(func() {
		yamlCfg := cfg.Snapshot()
		results := traderMgr.Process(sig, candles, yamlCfg.Paper.SlippagePct)
		recordTraderDecisions(signalLedger, sig, results, log)
		logTraderResults(log, results)
		if !anyTraderIn(results) {
			for _, r := range results {
				log.Scanner.Info().
					Str("symbol", sig.Symbol).
					Int("score", sig.Score).
					Str("alert", sig.AlertType).
					Str("trader", r.Profile.Name).
					Str("reason", r.Reason).
					Msg("trader skipped")
			}
			notify.EnqueueWatch(rejectedSignal(sig, results))
			return
		}
		notify.EnqueueMultiTrader(results)
	}) {
		recordDecision(signalLedger, sig.SignalID, signals.DecisionQueue, "ACCEPTED", nil, time.Now().UTC(), log)
		return
	}
	log.Errors.Warn().Str("symbol", sig.Symbol).Msg("execution queue full; trade intent rejected")
	recordDecision(signalLedger, sig.SignalID, signals.DecisionQueue, "REJECTED", "execution queue full", time.Now().UTC(), log)
	notify.EnqueueWatch(rejectedSignal(sig, nil))
}

func rejectedSignal(sig analyzer.Signal, results []traders.Result) analyzer.Signal {
	sig.AlertType = strategy.AlertInvalidated
	sig.TradeAction = strategy.ActionNoTrade
	for _, result := range results {
		if result.Reason == "" {
			continue
		}
		sig.Reasons = append(sig.Reasons, result.Profile.Name+": "+result.Reason)
	}
	if len(results) == 0 {
		sig.Reasons = append(sig.Reasons, "execution queue is full")
	}
	return sig
}

func anyTraderIn(results []traders.Result) bool {
	for _, r := range results {
		if !r.Skipped {
			return true
		}
	}
	return false
}

func recordSignal(ledger *signals.Repository, sig analyzer.Signal, st *analyzer.SymbolState, qualityEngine *quality.Engine, btcContext *market.BTCContext, cfg *config.Config, log *logger.Loggers) {
	if ledger == nil {
		return
	}
	trainingCfg := cfg.Snapshot().Training
	direction := sig.TradeAction
	if direction == "" {
		direction = sig.Movement
	}
	phase := sig.AlertType
	if phase == "" {
		phase = "CANDIDATE"
	}
	features := signals.TrainingFeatures{
		FeatureVersion: trainingCfg.FeatureVersion,
		VolumeRatio:    sig.VolumeRatio, OIChange: sig.OIChange3m, PriceChange: sig.PriceChange1m,
		Funding: sig.FundingRate, Orderflow: sig.TradeDelta1m, Spread: sig.SpreadPct, ATR: sig.ATRPct,
		BTCChange: sig.BTCChange5m, MarketRegime: string(market.RegimeUnknown), Setup: sig.SetupType,
		Score:            sig.Score,
		LabelCostBps:     trainingCfg.EntryFeeBps + trainingCfg.ExitFeeBps + 2*trainingCfg.SlippageBps,
		LabelCostVersion: trainingCfg.CostVersion,
	}
	if btcContext == nil {
		features.MultiTFReason = "BTC context unavailable"
	} else {
		contextSnapshot := btcContext.SnapshotAt(sig.Timestamp)
		features.MarketRegime = string(contextSnapshot.Regime)
		features.MultiTFScore, features.MultiTFAvailable = market.MultiTFScore(contextSnapshot)
		features.MultiTFReason = contextSnapshot.Reason
	}
	if err := ledger.RecordSignal(context.Background(), signals.SignalRecord{
		ID: sig.SignalID, ParentID: sig.ParentSignalID, OccurredAt: sig.Timestamp,
		Symbol: sig.Symbol, Direction: direction, Phase: phase, Detector: "legacy_detector",
		Price: sig.Price, FeatureVersion: trainingCfg.FeatureVersion, LabelVersion: trainingCfg.LabelVersion,
		LabelCostVersion: trainingCfg.CostVersion, LabelCostBps: features.LabelCostBps, Features: features, Explanation: map[string]any{"reasons": sig.Reasons},
	}); err != nil {
		log.Errors.Warn().Err(err).Str("signal_id", sig.SignalID).Msg("signal ledger record failed")
		return
	}
	recordDecision(ledger, sig.SignalID, signals.DecisionCandidate, "DETECTED", nil, sig.Timestamp, log)
	if qualityEngine == nil || st == nil {
		return
	}
	assessment := qualityEngine.Assess(sig, st.SnapshotQuality(sig.Symbol, sig.Timestamp))
	recordDecision(ledger, sig.SignalID, signals.DecisionQualityShadow, "ASSESSED", assessment, sig.Timestamp, log)
	if btcContext != nil && cfg != nil && cfg.Snapshot().MarketContext.Enabled {
		direction := sig.TradeAction
		if direction == "" {
			direction = sig.Movement
		}
		if direction == "PUMP" {
			direction = strategy.ActionLong
		} else if direction == "DUMP" {
			direction = strategy.ActionShort
		}
		contextDecision := btcContext.Decide(direction, sig.Timestamp)
		recordDecision(ledger, sig.SignalID, "MARKET_CONTEXT_SHADOW", "ASSESSED", contextDecision, sig.Timestamp, log)
	}
}

func recordMomentumDecision(ledger *signals.Repository, decision *momentum.Decision, cfg *config.Config, log *logger.Loggers) {
	if ledger == nil || decision == nil {
		return
	}
	phase, result := "MOMENTUM_TIER_A_REJECTED", "REJECTED"
	price, setup := 0.0, momentum.SetupIdentity
	if decision.Signal != nil {
		phase, result = decision.Signal.AlertType, "PAPER_ACCEPTED"
		price, setup = decision.Signal.Price, decision.Signal.SetupType
	}
	trainingCfg := cfg.Snapshot().Training
	paperOnly := cfg.Snapshot().MomentumScalper.PaperOnly
	err := ledger.RecordSignal(context.Background(), signals.SignalRecord{
		ID: decision.SignalID, OccurredAt: decision.T0, Symbol: decision.Symbol,
		Direction: decision.Direction, Phase: phase, Detector: momentum.DetectorIdentity, Price: price,
		FeatureVersion: trainingCfg.FeatureVersion, LabelVersion: trainingCfg.LabelVersion,
		Explanation: map[string]any{
			"setup": setup, "t0": decision.T0, "input_snapshot": decision.Snapshot,
			"gate_reasons": decision.Reasons, "paper_only": paperOnly,
		},
	})
	if err != nil {
		log.Errors.Warn().Err(err).Str("signal_id", decision.SignalID).Msg("momentum ledger record failed")
		return
	}
	recordDecision(ledger, decision.SignalID, "MOMENTUM_TIER_A_GATES", result, map[string]any{
		"reasons": decision.Reasons,
	}, decision.T0, log)
}

func recordDecision(ledger *signals.Repository, signalID, stage, result string, details any, at time.Time, log *logger.Loggers) {
	if ledger == nil || signalID == "" {
		return
	}
	if err := ledger.RecordDecision(context.Background(), signals.DecisionRecord{
		SignalID: signalID, Stage: stage, Result: result, Details: details, At: at,
	}); err != nil {
		log.Errors.Warn().Err(err).Str("signal_id", signalID).Str("stage", stage).Msg("signal ledger decision failed")
	}
}

func recordSignalMark(ledger *signals.Repository, symbol string, price float64, exchangeAt time.Time, log *logger.Loggers) {
	if ledger == nil || price <= 0 {
		return
	}
	source := "bybit_ticker_exchange"
	if exchangeAt.IsZero() {
		exchangeAt = time.Now().UTC()
		source = "bybit_ticker_received"
	}
	if err := ledger.ObserveMark(context.Background(), symbol, price, source, exchangeAt); err != nil {
		log.Errors.Warn().Err(err).Str("symbol", symbol).Msg("signal ledger outcome mark failed")
	}
}

func recordTraderDecisions(ledger *signals.Repository, sig analyzer.Signal, results []traders.Result, log *logger.Loggers) {
	details := make([]map[string]any, 0, len(results))
	approved := false
	demo := false
	for _, result := range results {
		details = append(details, map[string]any{
			"profile_id": result.Profile.ID, "skipped": result.Skipped, "reason": result.Reason,
			"demo_executed": result.DemoExecuted, "demo_order_id": result.DemoOrderID,
		})
		if !result.Skipped {
			approved = true
			demo = demo || result.DemoExecuted
		}
	}
	profileResult := "REJECTED"
	if approved {
		profileResult = "APPROVED"
	}
	recordDecision(ledger, sig.SignalID, signals.DecisionProfile, profileResult, details, time.Now().UTC(), log)
	executionResult := "NOT_SUBMITTED"
	if demo {
		executionResult = "DEMO_SUBMITTED"
	} else if approved {
		executionResult = "PAPER_RECORDED"
	}
	recordDecision(ledger, sig.SignalID, signals.DecisionExecution, executionResult, details, time.Now().UTC(), log)
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

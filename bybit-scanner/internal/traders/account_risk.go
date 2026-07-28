package traders

import (
	"fmt"
	"strings"

	"bybit-scanner/internal/risk"
)

// accountRiskLedger enforces limits against the single exchange account.
// Profile risk managers remain attribution-only: their independent budgets
// must never be summed as if they were separate accounts.
type accountRiskLedger struct {
	cfg    risk.Config
	equity float64
	active map[string]risk.TradeRecommendation
}

func newAccountRiskLedger(cfg risk.Config, flags risk.RuntimeFlags) *accountRiskLedger {
	risk.ApplyDefaults(&cfg)
	equity := flags.Equity(flags.Mode, cfg.Account.LiveEquityUSDT)
	if equity <= 0 {
		equity = cfg.Account.DemoEquityUSDT
	}
	return &accountRiskLedger{cfg: cfg, equity: equity, active: make(map[string]risk.TradeRecommendation)}
}

func (l *accountRiskLedger) Reserve(id string, rec risk.TradeRecommendation) error {
	if id == "" {
		return fmt.Errorf("missing account reservation id")
	}
	if _, exists := l.active[id]; exists {
		return fmt.Errorf("duplicate account reservation %s", id)
	}
	if l.equity <= 0 {
		return fmt.Errorf("account equity is unknown")
	}

	var notional, margin, gross float64
	openSameSide := 0
	bucketCount := 0
	for _, open := range l.active {
		notional += open.NotionalUSDT
		margin += open.MarginUSDT
		gross += open.NotionalUSDT
		if open.Side == rec.Side {
			openSameSide++
		}
		if open.Signal.Symbol == rec.Signal.Symbol {
			return fmt.Errorf("account symbol exposure already exists for %s", rec.Signal.Symbol)
		}
		if open.Side == rec.Side && accountBucket(l.cfg, open.Signal.Symbol) == accountBucket(l.cfg, rec.Signal.Symbol) {
			bucketCount++
		}
	}
	notional += rec.NotionalUSDT
	margin += rec.MarginUSDT
	gross += rec.NotionalUSDT

	maxNotional := l.cfg.Sizing.MaxNotionalUSDT
	if byPct := l.equity * l.cfg.Sizing.MaxNotionalPct / 100; byPct > 0 && (maxNotional <= 0 || byPct < maxNotional) {
		maxNotional = byPct
	}
	if maxNotional > 0 && notional > maxNotional {
		return fmt.Errorf("account notional cap exceeded (%.2f > %.2f)", notional, maxNotional)
	}
	if maxMargin := l.equity * l.cfg.Sizing.MaxMarginUsagePct / 100; maxMargin > 0 && margin > maxMargin {
		return fmt.Errorf("account margin cap exceeded (%.2f > %.2f)", margin, maxMargin)
	}
	if maxGross := l.equity * l.cfg.Portfolio.MaxGrossExposurePct / 100; maxGross > 0 && gross > maxGross {
		return fmt.Errorf("account gross exposure cap exceeded (%.2f > %.2f)", gross, maxGross)
	}
	if maxOpen := accountMaxOpen(l.cfg, rec.Mode); maxOpen > 0 && len(l.active)+1 > maxOpen {
		return fmt.Errorf("account open-position cap exceeded")
	}
	if maxSide := l.cfg.Portfolio.MaxTotalSameSide; maxSide > 0 && openSameSide+1 > maxSide {
		return fmt.Errorf("account same-side cap exceeded")
	}
	if maxBucket := l.cfg.Portfolio.MaxSameBucketSameSide; maxBucket > 0 && bucketCount+1 > maxBucket {
		return fmt.Errorf("account correlation bucket cap exceeded for %s", accountBucket(l.cfg, rec.Signal.Symbol))
	}
	l.active[id] = rec
	return nil
}

func (l *accountRiskLedger) Confirm(reservationID, orderID string) {
	rec, ok := l.active[reservationID]
	if !ok || orderID == "" {
		return
	}
	delete(l.active, reservationID)
	l.active[orderID] = rec
}

func (l *accountRiskLedger) Release(id string) {
	delete(l.active, id)
}

func accountMaxOpen(cfg risk.Config, mode risk.TradingMode) int {
	if mode == risk.ModeLive {
		return cfg.Portfolio.MaxOpenPositions.Live
	}
	return cfg.Portfolio.MaxOpenPositions.Demo
}

func accountBucket(cfg risk.Config, symbol string) string {
	for bucket, symbols := range cfg.Portfolio.CorrelationBuckets {
		for _, candidate := range symbols {
			if strings.EqualFold(candidate, symbol) {
				return bucket
			}
		}
	}
	return "other"
}

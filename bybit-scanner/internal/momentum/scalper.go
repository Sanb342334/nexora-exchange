// Package momentum contains the isolated Tier A momentum entry pipeline.
package momentum

import (
	"fmt"
	"math"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/market"
	"bybit-scanner/internal/signals"
	"bybit-scanner/internal/strategy"
)

const (
	DetectorIdentity = "momentum_scalper_tier_a"
	SetupIdentity    = "MOMENTUM_SCALPER_TIER_A"
)

// Decision retains every gate outcome for the immutable ledger audit record.
// Signal is populated only when every Tier A gate passes.
type Decision struct {
	Symbol    string
	Signal    *analyzer.Signal
	SignalID  string
	Direction string
	Reasons   []string
	T0        time.Time
	Snapshot  InputSnapshot
}

// InputSnapshot is the immutable T0 evidence used by the decision. It keeps
// missing data distinguishable from a zero-valued market feature.
type InputSnapshot struct {
	Price       float64
	PriceChange float64
	Orderflow   float64
	OIChange    float64
	Spread      float64
	TickerAt    time.Time
	TradeAt     time.Time
	OIAt        time.Time
	KlineAt     time.Time
	BTC         market.ContextDecision
	Orderbook   *market.BookSnapshot
}

type Engine struct {
	cfg      *config.Config
	mu       sync.Mutex
	lastSeen map[string]time.Time
}

func NewEngine(cfg *config.Config) *Engine {
	return &Engine{cfg: cfg, lastSeen: make(map[string]time.Time)}
}

func (e *Engine) Enabled() bool {
	return e.cfg.Snapshot().MomentumScalper.Enabled
}

// Evaluate takes a T0 snapshot of every input and fails closed when any
// required feed is stale, inconsistent, or directionally contradictory.
func (e *Engine) Evaluate(symbol string, st *analyzer.SymbolState, btc *market.BTCContext, books *market.OrderBookStore, now time.Time) *Decision {
	cfg := e.cfg.Snapshot().MomentumScalper
	if !cfg.Enabled || !allowedSymbol(cfg.Symbols, symbol) {
		return nil
	}
	s := st.SnapshotQuality(symbol, now)
	if s.Price <= 0 || s.Candle.Open <= 0 {
		return nil // no observable price continuation candidate at T0
	}
	priceChange := (s.Price - s.Candle.Open) / s.Candle.Open * 100
	if math.Abs(priceChange) < cfg.MinPriceChangePct {
		return nil
	}

	d := &Decision{
		Symbol: symbol, T0: now, SignalID: signals.NewID(),
		Snapshot: InputSnapshot{
			Price: s.Price, PriceChange: priceChange, Orderflow: s.TradeDeltaUSDT, OIChange: s.OIChange3m, Spread: s.SpreadPct,
			TickerAt: s.TickerAt, TradeAt: s.TradeAt, OIAt: s.OIAt, KlineAt: s.KlineAt,
		},
	}
	freshness := time.Duration(cfg.FreshnessMS) * time.Millisecond
	if !fresh(s.TickerAt, now, freshness) {
		d.Reasons = append(d.Reasons, "reject:ticker_stale")
	}
	if !fresh(s.TradeAt, now, freshness) {
		d.Reasons = append(d.Reasons, "reject:trade_flow_stale")
	}
	if !fresh(s.OIAt, now, freshness) {
		d.Reasons = append(d.Reasons, "reject:open_interest_stale")
	}
	if !fresh(s.KlineAt, now, freshness) {
		d.Reasons = append(d.Reasons, "reject:kline_stale")
	}
	if s.Bid <= 0 || s.Ask <= s.Bid || s.SpreadPct <= 0 || s.SpreadPct > cfg.MaxSpreadPct {
		d.Reasons = append(d.Reasons, "reject:spread_invalid_or_wide")
	}
	direction := strategy.ActionLong
	if priceChange < 0 {
		direction = strategy.ActionShort
	}
	d.Direction = direction
	if math.Abs(s.TradeDeltaUSDT) < cfg.MinOrderflowUSDT || (direction == strategy.ActionLong && s.TradeDeltaUSDT <= 0) || (direction == strategy.ActionShort && s.TradeDeltaUSDT >= 0) {
		d.Reasons = append(d.Reasons, "reject:orderflow_not_aligned")
	}
	if math.Abs(s.OIChange3m) < cfg.MinOIChangePct || (direction == strategy.ActionLong && s.OIChange3m <= 0) || (direction == strategy.ActionShort && s.OIChange3m >= 0) {
		d.Reasons = append(d.Reasons, "reject:open_interest_not_aligned")
	}
	if btc == nil {
		d.Reasons = append(d.Reasons, "reject:btc_regime_unavailable")
	} else if regime := btc.Decide(direction, now); !regime.Available || regime.Veto {
		d.Snapshot.BTC = regime
		d.Reasons = append(d.Reasons, "reject:btc_regime:"+regime.Reason)
	} else {
		d.Snapshot.BTC = regime
		d.Reasons = append(d.Reasons, "btc_regime:"+string(regime.Regime))
	}
	if cfg.RequireOrderbook {
		if books == nil {
			d.Reasons = append(d.Reasons, "reject:orderbook_unavailable")
		} else if snapshot, ok := books.Snapshot(symbol, now, time.Duration(cfg.OrderbookMaxAgeMS)*time.Millisecond); !ok {
			d.Reasons = append(d.Reasons, "reject:orderbook_missing")
		} else {
			d.Snapshot.Orderbook = &snapshot
			metrics := market.MeasureBook(snapshot, 10)
			if !metrics.Available {
				d.Reasons = append(d.Reasons, "reject:orderbook_stale_or_sequence_gap")
			} else if metrics.BidDepth+metrics.AskDepth < cfg.OrderbookMinDepthUSDT {
				d.Reasons = append(d.Reasons, "reject:orderbook_depth_insufficient")
			}
		}
	}
	if rejected(d.Reasons) {
		return d
	}
	if !e.allow(symbol, direction, now, time.Duration(cfg.CooldownSec)*time.Second) {
		d.Reasons = append(d.Reasons, "reject:momentum_cooldown")
		return d
	}
	movement := "PUMP"
	if direction == strategy.ActionShort {
		movement = "DUMP"
	}
	d.Signal = &analyzer.Signal{
		Symbol: symbol, SignalID: d.SignalID, Timestamp: now, Price: s.Price,
		Movement: movement, TradeAction: direction, AlertType: "MOMENTUM_TIER_A",
		SetupType: SetupIdentity, Score: 100,
		Triggers:      []analyzer.TriggerType{analyzer.TriggerPriceVol, analyzer.TriggerOrderflow, analyzer.TriggerOIJump},
		PriceChange1m: priceChange, OIChange3m: s.OIChange3m, TradeDelta1m: s.TradeDeltaUSDT,
		SpreadPct: s.SpreadPct, FundingRate: s.FundingRate,
		Reasons: append(d.Reasons, fmt.Sprintf("tier_a:t0=%s", now.UTC().Format(time.RFC3339Nano)), "paper_only="+fmt.Sprint(cfg.PaperOnly)),
	}
	return d
}

func (e *Engine) allow(symbol, direction string, now time.Time, cooldown time.Duration) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	key := symbol + ":" + direction
	if last := e.lastSeen[key]; !last.IsZero() && now.Sub(last) < cooldown {
		return false
	}
	e.lastSeen[key] = now
	return true
}

func fresh(at, now time.Time, maxAge time.Duration) bool {
	return !at.IsZero() && !at.After(now) && now.Sub(at) <= maxAge
}

func allowedSymbol(symbols []string, symbol string) bool {
	for _, candidate := range symbols {
		if candidate == symbol {
			return true
		}
	}
	return false
}

func rejected(reasons []string) bool {
	for _, reason := range reasons {
		if len(reason) >= len("reject:") && reason[:len("reject:")] == "reject:" {
			return true
		}
	}
	return false
}

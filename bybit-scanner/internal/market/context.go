package market

import (
	"math"
	"sort"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
)

type MarketRegime string

const (
	RegimeUnknown        MarketRegime = "UNKNOWN"
	RegimeTrendUp        MarketRegime = "TREND_UP"
	RegimeTrendDown      MarketRegime = "TREND_DOWN"
	RegimeRange          MarketRegime = "RANGE"
	RegimeHighVolatility MarketRegime = "HIGH_VOLATILITY"
)

// ContextSnapshot contains only confirmed BTC candles. It is safe to persist
// as a point-in-time shadow feature and intentionally excludes partial bars.
type ContextSnapshot struct {
	ObservedAt time.Time
	Regime     MarketRegime
	Available  bool
	Reason     string
	Candles    map[string][]analyzer.Candle
}

// ContextDecision is audit-only. A later promoted policy may consume its veto
// and size multiplier, but the scanner currently does not.
type ContextDecision struct {
	Regime         MarketRegime
	Available      bool
	Veto           bool
	SizeMultiplier float64
	Reason         string
}

// BTCContext keeps separate close-only rings for the requested timeframes.
// Kline WS updates can repeat a close, therefore inserts are idempotent by
// candle start time.
type BTCContext struct {
	mu      sync.RWMutex
	rings   map[string][]analyzer.Candle
	maxBars int
}

func NewBTCContext(maxBars int) *BTCContext {
	if maxBars <= 0 {
		maxBars = 120
	}
	return &BTCContext{rings: make(map[string][]analyzer.Candle), maxBars: maxBars}
}

func (c *BTCContext) Update(interval string, candle analyzer.Candle) {
	if !candle.Confirmed || candle.Start.IsZero() || candle.Close <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	ring := c.rings[interval]
	for i := range ring {
		if ring[i].Start.Equal(candle.Start) {
			ring[i] = candle
			c.rings[interval] = ring
			return
		}
	}
	ring = append(ring, candle)
	sort.Slice(ring, func(i, j int) bool { return ring[i].Start.Before(ring[j].Start) })
	if len(ring) > c.maxBars {
		ring = append([]analyzer.Candle(nil), ring[len(ring)-c.maxBars:]...)
	}
	c.rings[interval] = ring
}

func (c *BTCContext) Snapshot(now time.Time) ContextSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := ContextSnapshot{ObservedAt: now, Regime: RegimeUnknown, Candles: make(map[string][]analyzer.Candle, len(c.rings))}
	for interval, ring := range c.rings {
		out.Candles[interval] = append([]analyzer.Candle(nil), ring...)
	}
	out.Regime, out.Available, out.Reason = classifyRegime(out.Candles)
	return out
}

// SnapshotAt excludes a candle unless it was fully confirmed by now. This
// prevents a delayed signal from inheriting BTC information that arrived after
// its T0 timestamp.
func (c *BTCContext) SnapshotAt(now time.Time) ContextSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := ContextSnapshot{ObservedAt: now, Regime: RegimeUnknown, Candles: make(map[string][]analyzer.Candle, len(c.rings))}
	for interval, ring := range c.rings {
		duration, ok := candleDuration(interval)
		if !ok {
			continue
		}
		for _, candle := range ring {
			if !candle.Start.Add(duration).After(now) {
				out.Candles[interval] = append(out.Candles[interval], candle)
			}
		}
	}
	out.Regime, out.Available, out.Reason = classifyRegime(out.Candles)
	return out
}

func candleDuration(interval string) (time.Duration, bool) {
	switch interval {
	case "1":
		return time.Minute, true
	case "5":
		return 5 * time.Minute, true
	case "15":
		return 15 * time.Minute, true
	case "60":
		return time.Hour, true
	default:
		return 0, false
	}
}

// MultiTFScore is a deterministic, confirmed-candle-only feature. A missing
// context has score zero and Available=false; zero is never used as a proxy
// for an unavailable future observation.
func MultiTFScore(snapshot ContextSnapshot) (score float64, available bool) {
	if !snapshot.Available {
		return 0, false
	}
	positive, negative := 0, 0
	for _, interval := range []string{"5", "15", "60"} {
		value := returnPct(snapshot.Candles[interval])
		if value > 0 {
			positive++
		} else if value < 0 {
			negative++
		}
	}
	return float64(positive-negative) * 100 / 3, true
}

func (c *BTCContext) Decide(direction string, now time.Time) ContextDecision {
	s := c.Snapshot(now)
	d := ContextDecision{Regime: s.Regime, Available: s.Available, SizeMultiplier: 1, Reason: s.Reason}
	if !s.Available {
		d.Veto = true
		d.SizeMultiplier = 0
		return d
	}
	switch s.Regime {
	case RegimeHighVolatility:
		d.Veto, d.SizeMultiplier = true, 0
		d.Reason = "high-volatility context is shadow-vetoed"
	case RegimeTrendUp:
		if direction == "SHORT" {
			d.Veto, d.SizeMultiplier = true, 0
			d.Reason = "short contradicts confirmed BTC uptrend"
		}
	case RegimeTrendDown:
		if direction == "LONG" {
			d.Veto, d.SizeMultiplier = true, 0
			d.Reason = "long contradicts confirmed BTC downtrend"
		}
	case RegimeRange:
		d.SizeMultiplier = 0.5
	}
	return d
}

func classifyRegime(rings map[string][]analyzer.Candle) (MarketRegime, bool, string) {
	one := rings["1"]
	five, fifteen, hour := rings["5"], rings["15"], rings["60"]
	if len(one) < 15 || len(five) < 5 || len(fifteen) < 3 || len(hour) < 2 {
		return RegimeUnknown, false, "insufficient confirmed BTC candles across 1m/5m/15m/1h"
	}
	vol := averageRangePct(one[len(one)-15:])
	if vol >= 1.2 {
		return RegimeHighVolatility, true, "elevated confirmed 1m BTC range"
	}
	r5, r15, r60 := returnPct(five), returnPct(fifteen), returnPct(hour)
	if r5 > 0.15 && r15 > 0.25 && r60 > 0.35 {
		return RegimeTrendUp, true, "confirmed BTC returns align upward"
	}
	if r5 < -0.15 && r15 < -0.25 && r60 < -0.35 {
		return RegimeTrendDown, true, "confirmed BTC returns align downward"
	}
	return RegimeRange, true, "no multi-timeframe BTC trend alignment"
}

func returnPct(candles []analyzer.Candle) float64 {
	if len(candles) < 2 || candles[0].Close <= 0 {
		return 0
	}
	return (candles[len(candles)-1].Close - candles[0].Close) / candles[0].Close * 100
}

func averageRangePct(candles []analyzer.Candle) float64 {
	var total float64
	var count int
	for _, candle := range candles {
		if candle.Close <= 0 {
			continue
		}
		total += math.Abs(candle.High-candle.Low) / candle.Close * 100
		count++
	}
	if count == 0 {
		return 0
	}
	return total / float64(count)
}

package market

import (
	"testing"
	"time"

	"bybit-scanner/internal/analyzer"
)

func TestBTCContextUsesConfirmedCandlesAcrossTimeframes(t *testing.T) {
	ctx := NewBTCContext(120)
	now := time.Now().UTC().Truncate(time.Hour)
	for _, interval := range []string{"1", "5", "15", "60"} {
		count := map[string]int{"1": 15, "5": 5, "15": 3, "60": 2}[interval]
		for i := 0; i < count; i++ {
			price := 100.0 + float64(i)
			ctx.Update(interval, analyzer.Candle{Start: now.Add(time.Duration(i) * time.Minute), Open: price - .2, High: price + .5, Low: price - .5, Close: price, Confirmed: true})
		}
	}
	ctx.Update("1", analyzer.Candle{Start: now.Add(99 * time.Minute), Close: 999, Confirmed: false})

	snapshot := ctx.Snapshot(now)
	if !snapshot.Available || snapshot.Regime != RegimeTrendUp {
		t.Fatalf("got available=%v regime=%s (%s)", snapshot.Available, snapshot.Regime, snapshot.Reason)
	}
	if len(snapshot.Candles["1"]) != 15 {
		t.Fatalf("partial candle was recorded: %d candles", len(snapshot.Candles["1"]))
	}
	if decision := ctx.Decide("SHORT", now); !decision.Veto || decision.SizeMultiplier != 0 {
		t.Fatalf("countertrend short must be vetoed in context: %+v", decision)
	}
}

func TestBTCContextUnknownWithoutAllTimeframes(t *testing.T) {
	ctx := NewBTCContext(10)
	ctx.Update("1", analyzer.Candle{Start: time.Now(), Close: 100, Confirmed: true})
	if snapshot := ctx.Snapshot(time.Now()); snapshot.Available || snapshot.Regime != RegimeUnknown {
		t.Fatalf("expected unavailable unknown context: %+v", snapshot)
	}
}

func TestSnapshotAtExcludesCandlesConfirmedAfterSignalTime(t *testing.T) {
	ctx := NewBTCContext(10)
	t0 := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	ctx.Update("1", analyzer.Candle{Start: t0, Close: 100, Confirmed: true})
	ctx.Update("1", analyzer.Candle{Start: t0.Add(time.Minute), Close: 101, Confirmed: true})
	snapshot := ctx.SnapshotAt(t0.Add(time.Minute))
	if got := len(snapshot.Candles["1"]); got != 1 {
		t.Fatalf("got %d candles at T0, want 1 confirmed candle", got)
	}
	if score, available := MultiTFScore(snapshot); available || score != 0 {
		t.Fatalf("unavailable context must not produce a usable score: score=%v available=%v", score, available)
	}
}

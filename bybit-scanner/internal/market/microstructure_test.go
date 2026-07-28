package market

import (
	"testing"
	"time"
)

func TestOrderBookRejectsDeltaGapUntilSnapshot(t *testing.T) {
	book := NewOrderBook("BTCUSDT")
	now := time.Now().UTC()
	if !book.Apply(BookUpdate{Symbol: "BTCUSDT", Type: "snapshot", UpdateID: 10, ReceivedAt: now,
		Bids: []BookLevel{{Price: 100, Size: 2}}, Asks: []BookLevel{{Price: 101, Size: 3}}}) {
		t.Fatal("snapshot should apply")
	}
	if book.Apply(BookUpdate{Symbol: "BTCUSDT", Type: "delta", UpdateID: 12, PrevID: 9, ReceivedAt: now}) {
		t.Fatal("gap delta must not apply")
	}
	if book.Apply(BookUpdate{Symbol: "BTCUSDT", Type: "delta", UpdateID: 13, PrevID: 12, ReceivedAt: now}) {
		t.Fatal("deltas must remain invalid until resnapshot")
	}
	snapshot := book.Snapshot(now, time.Second)
	if !snapshot.Gap || MeasureBook(snapshot, 10).Available {
		t.Fatal("gapped book must be unavailable")
	}
}

func TestMeasureBookAndLiquidityTier(t *testing.T) {
	now := time.Now().UTC()
	snapshot := BookSnapshot{UpdatedAt: now, Bids: []BookLevel{{Price: 100, Size: 1_000}}, Asks: []BookLevel{{Price: 100.02, Size: 1_000}}}
	metrics := MeasureBook(snapshot, 1)
	if !metrics.Available || metrics.Microprice != 100.01 {
		t.Fatalf("unexpected metrics: %+v", metrics)
	}
	if tier := ClassifyLiquidity(metrics.SpreadPct, metrics.BidDepth+metrics.AskDepth, 0.01, true, metrics.Available); tier != LiquidityTierA {
		t.Fatalf("expected Tier A, got %s", tier)
	}
	if tier := ClassifyLiquidity(metrics.SpreadPct, 1_000_000, 0.01, false, true); tier != LiquidityUnavailable {
		t.Fatalf("unhealthy websocket must not have a tier: %s", tier)
	}
}

func TestSweepRequiresBreachReclaimAndFlow(t *testing.T) {
	var tracker SweepTracker
	now := time.Now().UTC()
	if tracker.Observe(99, 100, -10, now, "DOWN") {
		t.Fatal("breach alone is not a sweep")
	}
	if tracker.Observe(100.2, 100, -1, now.Add(time.Second), "DOWN") {
		t.Fatal("reclaim without confirming buy flow is not a sweep")
	}
	if !tracker.Observe(100.2, 100, 10, now.Add(2*time.Second), "DOWN") {
		t.Fatal("breach + reclaim + buy flow should confirm sweep")
	}
}

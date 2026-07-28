package traders

import (
	"testing"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/risk"
)

func TestStatsStorePersistsOpenAndReconcilesClose(t *testing.T) {
	dir := t.TempDir()
	rec := risk.TradeRecommendation{
		Signal: analyzer.Signal{
			Symbol:    "BTCUSDT",
			Timestamp: time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC),
		},
		Side:       risk.SideLong,
		Entry:      100,
		StopLoss:   99,
		TakeProfit: 102,
		RiskUSDT:   10,
	}

	store := NewStatsStore(dir, "test")
	store.RecordOpen(rec)

	restarted := NewStatsStore(dir, "test")
	if got := restarted.Snapshot().Open; got != 1 {
		t.Fatalf("restored open = %d, want 1", got)
	}
	restarted.RecordExchangeCloseFor(rec, 20)
	stats := restarted.Snapshot()
	if stats.Open != 0 || stats.Wins != 1 || stats.TotalPnL != 20 {
		t.Fatalf("unexpected reconciled stats: %+v", stats)
	}
	if stats.AverageR != 2 {
		t.Fatalf("average R = %.2f, want 2", stats.AverageR)
	}
}

package traders

import (
	"path/filepath"
	"testing"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/risk"
)

func TestAccountRiskLedgerReservesAggregateExposure(t *testing.T) {
	cfg := risk.Config{
		Account: risk.AccountConfig{DemoEquityUSDT: 1_000},
		Sizing: risk.SizingConfig{
			MaxNotionalUSDT: 500, MaxNotionalPct: 100, MaxMarginUsagePct: 50,
		},
		Portfolio: risk.PortfolioConfig{
			MaxOpenPositions:      risk.ModeLimits{Demo: 3},
			MaxGrossExposurePct:   60,
			MaxTotalSameSide:      2,
			MaxSameBucketSameSide: 1,
			CorrelationBuckets:    map[string][]string{"majors": {"BTCUSDT", "ETHUSDT"}},
		},
	}
	ledger := newAccountRiskLedger(cfg, risk.RuntimeFlags{Mode: risk.ModeDemo, DemoEquityUSDT: 1_000})
	btc := testAccountRec("BTCUSDT", 300, 100, risk.SideLong)
	if err := ledger.Reserve("intent-1", btc); err != nil {
		t.Fatalf("reserve BTC: %v", err)
	}
	if err := ledger.Reserve("intent-2", testAccountRec("ETHUSDT", 100, 50, risk.SideLong)); err == nil {
		t.Fatal("expected same-bucket reservation rejection")
	}
	ledger.Confirm("intent-1", "entry-order")
	ledger.Release("entry-order")
	if err := ledger.Reserve("intent-2", testAccountRec("ETHUSDT", 100, 50, risk.SideLong)); err != nil {
		t.Fatalf("released exposure should be available: %v", err)
	}
}

func TestAccountRiskLedgerRejectsGlobalNotional(t *testing.T) {
	ledger := newAccountRiskLedger(risk.Config{
		Account:   risk.AccountConfig{DemoEquityUSDT: 1_000},
		Sizing:    risk.SizingConfig{MaxNotionalUSDT: 500, MaxNotionalPct: 100, MaxMarginUsagePct: 100},
		Portfolio: risk.PortfolioConfig{MaxOpenPositions: risk.ModeLimits{Demo: 5}, MaxGrossExposurePct: 100},
	}, risk.RuntimeFlags{Mode: risk.ModeDemo, DemoEquityUSDT: 1_000})
	if err := ledger.Reserve("a", testAccountRec("BTCUSDT", 400, 100, risk.SideLong)); err != nil {
		t.Fatal(err)
	}
	if err := ledger.Reserve("b", testAccountRec("SOLUSDT", 200, 100, risk.SideShort)); err == nil {
		t.Fatal("expected global notional cap rejection")
	}
}

func TestReconciledOrderDedupSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "traders", "reconciled_demo_orders.json")
	manager := &Manager{
		reconciledPath:   path,
		reconciledOrders: map[string]struct{}{"close-order-1": {}},
	}
	manager.saveReconciledLocked()

	restarted := &Manager{
		reconciledPath:   path,
		reconciledOrders: make(map[string]struct{}),
	}
	restarted.loadReconciled()
	if _, exists := restarted.reconciledOrders["close-order-1"]; !exists {
		t.Fatal("reconciled close ID was not restored")
	}
}

func testAccountRec(symbol string, notional, margin float64, side risk.Side) risk.TradeRecommendation {
	return risk.TradeRecommendation{
		Signal: analyzer.Signal{Symbol: symbol},
		Side:   side, Mode: risk.ModeDemo, NotionalUSDT: notional, MarginUSDT: margin,
	}
}

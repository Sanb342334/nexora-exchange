package carry

import (
	"testing"
	"time"

	"bybit-scanner/internal/config"
)

func TestEvaluateUsesExecutablePricesAndCosts(t *testing.T) {
	now := time.Now().UTC()
	store := NewBasisStore()
	store.UpdateSpot("BTCUSDT", Quote{Bid: 99.9, Ask: 100, UpdatedAt: now})
	store.UpdatePerp("BTCUSDT", Quote{Bid: 101, Ask: 101.1, Funding: 0.001, UpdatedAt: now})
	cfg := config.CarryConfig{
		MinNetCarryBps: 50, FeeBpsPerLeg: 1, SlippageBpsPerLeg: 1, FundingUncertaintyBps: 1,
		MaxUnhedgedSeconds: 3,
	}
	op, ok := store.Evaluate("BTCUSDT", cfg, now)
	if !ok {
		t.Fatal("expected carry opportunity")
	}
	if op.BasisBps != 100 {
		t.Fatalf("basis = %.2f, want 100 bps", op.BasisBps)
	}
	if op.ExpectedNetBps <= cfg.MinNetCarryBps {
		t.Fatalf("net = %.2f should exceed threshold", op.ExpectedNetBps)
	}
}

func TestEvaluateRejectsStaleLeg(t *testing.T) {
	now := time.Now().UTC()
	store := NewBasisStore()
	store.UpdateSpot("BTCUSDT", Quote{Ask: 100, UpdatedAt: now.Add(-4 * time.Second)})
	store.UpdatePerp("BTCUSDT", Quote{Bid: 101, UpdatedAt: now})
	if _, ok := store.Evaluate("BTCUSDT", config.CarryConfig{
		MinNetCarryBps: 1, MaxUnhedgedSeconds: 3,
	}, now); ok {
		t.Fatal("stale quote must not be executable")
	}
}

func TestNetPnLIncludesBothLegsAndCosts(t *testing.T) {
	got := NetPnL(100, 110, 101, 111, 2, 1, 0.5)
	// spot +20, short perp -20, then fees -1 and funding +0.5
	if got != -0.5 {
		t.Fatalf("net pnl = %.2f, want -0.5", got)
	}
}

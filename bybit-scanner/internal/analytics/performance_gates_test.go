package analytics

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/research"
	"bybit-scanner/internal/signals"
)

func TestPerformanceGateDefaultsFailClosedWithInsufficientEvidence(t *testing.T) {
	cfg := config.PerformanceGatesConfig{
		Enabled: true, MinimumIndependent: 100, MinimumExpectancyBps: 1,
		MinimumProfitFactor: 1.1, MaximumDrawdownBps: 20, MaximumMissingRate: .05,
		DemoEligible: false,
	}
	decision := EvaluatePerformanceGate(research.Metrics{EffectiveSampleSize: 2, Observed: 2, ExpectancyBps: 4, ProfitFactor: 2},
		cfg, ManualGateRequest{ID: "review-1", SetupKey: "MOMENTUM_SCALPER_TIER_A|90_100|TREND_UP|A", Action: GateActionDemo, DecidedBy: "operator"})
	if decision.Eligible || !decision.RequiresManual || !contains(decision.Reasons, "insufficient evidence") || !contains(decision.Reasons, "demo is explicitly ineligible") {
		t.Fatalf("new strategy must remain ineligible: %+v", decision)
	}
}

func TestPerformanceGateKillRecordsWithoutExecutionAuthority(t *testing.T) {
	repo, err := signals.Open(filepath.Join(t.TempDir(), "signals.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()
	request := ManualGateRequest{ID: "kill-1", SetupKey: "MOMENTUM_SCALPER_TIER_A|90_100|TREND_UP|A", Action: GateActionKill, DecidedBy: "operator"}
	decision := EvaluatePerformanceGate(research.Metrics{}, config.PerformanceGatesConfig{}, request)
	if !decision.Eligible || decision.Action != GateActionKill {
		t.Fatalf("kill must be recordable: %+v", decision)
	}
	if err := RecordPerformanceGateDecision(context.Background(), repo, request, decision); err != nil {
		t.Fatal(err)
	}
	if err := RecordPerformanceGateDecision(context.Background(), repo, request, decision); err != nil {
		t.Fatalf("identical review should be idempotent: %v", err)
	}
}

func TestPerformanceGateNeverAcceptsLiveAction(t *testing.T) {
	decision := EvaluatePerformanceGate(research.Metrics{EffectiveSampleSize: 100, Observed: 100, ExpectancyBps: 2, ProfitFactor: 2},
		config.PerformanceGatesConfig{Enabled: true, MinimumIndependent: 100, MinimumProfitFactor: 1, MaximumMissingRate: .1},
		ManualGateRequest{SetupKey: "setup", Action: "LIVE", DecidedBy: "operator"})
	if decision.Eligible || !contains(decision.Reasons, "unsupported action") {
		t.Fatalf("live action was not rejected: %+v", decision)
	}
}

func contains(reasons []string, fragment string) bool {
	for _, reason := range reasons {
		if strings.Contains(reason, fragment) {
			return true
		}
	}
	return false
}

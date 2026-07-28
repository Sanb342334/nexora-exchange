package analytics

import (
	"context"
	"fmt"
	"strings"
	"time"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/research"
	"bybit-scanner/internal/signals"
)

const (
	GateActionShadow = "SHADOW"
	GateActionPaper  = "PAPER"
	GateActionDemo   = "DEMO"
	GateActionKill   = "KILL"
)

// ManualGateRequest is an operator's requested disposition. The evaluator
// intentionally has no AUTO_TRADE_DEMO, environment, or execution dependency.
type ManualGateRequest struct {
	ID        string
	SetupKey  string
	Action    string
	DecidedBy string
	At        time.Time
}

type ManualGateDecision struct {
	Eligible       bool
	RequiresManual bool
	Action         string
	Reasons        []string
}

// EvaluatePerformanceGate is fail-closed. Passing evidence only permits an
// operator-recorded SHADOW or PAPER disposition. Demo remains ineligible until
// config explicitly permits it; LIVE is not an accepted action.
func EvaluatePerformanceGate(metrics research.Metrics, cfg config.PerformanceGatesConfig, request ManualGateRequest) ManualGateDecision {
	d := ManualGateDecision{RequiresManual: true, Action: strings.ToUpper(strings.TrimSpace(request.Action))}
	if !cfg.Enabled {
		d.Reasons = append(d.Reasons, "performance gates are disabled; setup remains shadow/paper")
	}
	if request.SetupKey == "" || request.DecidedBy == "" {
		d.Reasons = append(d.Reasons, "manual setup key and operator are required")
	}
	if metrics.EffectiveSampleSize < cfg.MinimumIndependent {
		d.Reasons = append(d.Reasons, fmt.Sprintf("insufficient evidence: independent outcomes %d < %d", metrics.EffectiveSampleSize, cfg.MinimumIndependent))
	}
	if metrics.ExpectancyBps <= cfg.MinimumExpectancyBps {
		d.Reasons = append(d.Reasons, "after-cost expectancy is not positive enough")
	}
	if metrics.ProfitFactor < cfg.MinimumProfitFactor {
		d.Reasons = append(d.Reasons, "after-cost profit factor is below threshold")
	}
	if metrics.MaxDrawdownBps > cfg.MaximumDrawdownBps {
		d.Reasons = append(d.Reasons, "after-cost drawdown exceeds threshold")
	}
	total := metrics.Observed + metrics.Missing
	if total == 0 || float64(metrics.Missing)/float64(total) > cfg.MaximumMissingRate {
		d.Reasons = append(d.Reasons, "insufficient or incomplete outcome coverage")
	}
	switch d.Action {
	case GateActionKill:
		// A kill is always safe and can be recorded even with no sample.
		d.Eligible = true
		return d
	case GateActionShadow, GateActionPaper:
		// Retaining shadow/paper is safe, even when the evidence is insufficient.
	case GateActionDemo:
		if !cfg.DemoEligible {
			d.Reasons = append(d.Reasons, "demo is explicitly ineligible")
		}
	default:
		d.Reasons = append(d.Reasons, "unsupported action; live promotion is never accepted")
	}
	d.Eligible = len(d.Reasons) == 0
	return d
}

// RecordPerformanceGateDecision persists the operator review in the signal
// ledger. It records evidence only; callers must not infer execution authority.
func RecordPerformanceGateDecision(ctx context.Context, ledger *signals.Repository, request ManualGateRequest, decision ManualGateDecision) error {
	if ledger == nil {
		return fmt.Errorf("performance gate ledger is required")
	}
	return ledger.RecordPerformanceGateDecision(ctx, signals.PerformanceGateDecision{
		ID: request.ID, SetupKey: request.SetupKey, Action: decision.Action, Eligible: decision.Eligible,
		Reasons: decision.Reasons, DecidedBy: request.DecidedBy, At: request.At,
	})
}

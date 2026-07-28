package research

import (
	"context"
	"math"
	"testing"
	"time"
)

func TestEvaluateUsesOneIndependentAggregateOrderAndCosts(t *testing.T) {
	at := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	metrics := Evaluate([]Sample{
		{SignalID: "a", AggregateOrderID: "order-1", OccurredAt: at, DirectionBps: 20, MAEBps: -2, MFEBps: 22},
		{SignalID: "b", AggregateOrderID: "order-1", OccurredAt: at, DirectionBps: 20, MAEBps: -2, MFEBps: 22},
		{SignalID: "c", AggregateOrderID: "order-2", OccurredAt: at.Add(time.Minute), DirectionBps: -10, MAEBps: -11, MFEBps: 1},
		{SignalID: "missing", OccurredAt: at, Missing: true},
	}, CostModel{EntryFeeBps: 1, ExitFeeBps: 1, SlippageBps: 1})

	if metrics.Observed != 3 || metrics.Missing != 1 || metrics.EffectiveSampleSize != 2 {
		t.Fatalf("unexpected counts: %+v", metrics)
	}
	// The two profile allocations of order-1 are one independent observation.
	if math.Abs(metrics.ExpectancyBps-1) > 0.001 {
		t.Fatalf("post-cost expectancy = %v, want 1", metrics.ExpectancyBps)
	}
	if metrics.MaxDrawdownBps != 14 {
		t.Fatalf("drawdown = %v, want 14", metrics.MaxDrawdownBps)
	}
}

type fixedClock struct{ at time.Time }

func (c fixedClock) Now() time.Time { return c.at }

type sliceSource struct{ events []Event }

func (s *sliceSource) Next(context.Context) (Event, bool, error) {
	if len(s.events) == 0 {
		return Event{}, false, nil
	}
	event := s.events[0]
	s.events = s.events[1:]
	return event, true, nil
}

func TestReplayStopsAtInjectedClock(t *testing.T) {
	base := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	source := &sliceSource{events: []Event{
		{At: base, Sample: Sample{SignalID: "one"}},
		{At: base.Add(time.Minute), Sample: Sample{SignalID: "two"}},
	}}
	result, err := Replay(context.Background(), fixedClock{base.Add(30 * time.Second)}, source, time.Time{})
	if err != nil || len(result.Samples) != 1 || result.Samples[0].SignalID != "one" {
		t.Fatalf("unexpected replay: %+v, %v", result, err)
	}
}

func TestPromotionGateIsManualAndRequiresOOSEvidence(t *testing.T) {
	decision := (PromotionGate{
		Version: "quality-v1", ConfigHash: "abc", MinimumIndependent: 10,
		MinimumExpectancyBps: 1, MinimumProfitFactor: 1.1, MaximumDrawdownBps: 50, MaximumMissingRate: .1,
	}).EvaluatePromotion(Metrics{EffectiveSampleSize: 12, Observed: 12, ExpectancyBps: 2, ProfitFactor: 1.2, MaxDrawdownBps: 20})
	if !decision.Eligible || !decision.RequiresManual {
		t.Fatalf("promotion must be manual evidence only: %+v", decision)
	}
}

func TestSplitPurgesBoundaryWindows(t *testing.T) {
	base := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	split := Split{TrainEnd: base.Add(time.Hour), ValidationEnd: base.Add(2 * time.Hour), PurgeAndEmbargo: 5 * time.Minute}
	if got := split.Assign(base.Add(55 * time.Minute)); got != PartitionExcluded {
		t.Fatalf("before train boundary = %s", got)
	}
	if got := split.Assign(base.Add(30 * time.Minute)); got != PartitionTrain {
		t.Fatalf("train = %s", got)
	}
	if got := split.Assign(base.Add(90 * time.Minute)); got != PartitionValidation {
		t.Fatalf("validation = %s", got)
	}
	if got := split.Assign(base.Add(3 * time.Hour)); got != PartitionHoldout {
		t.Fatalf("holdout = %s", got)
	}
}

func TestReportsSuppressUnderpoweredProfitFactor(t *testing.T) {
	at := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	reports := Reports([]Sample{{SignalID: "a", OccurredAt: at, Setup: "IMPULSE", LiquidityTier: "A", Regime: "RANGE", DirectionBps: 10}},
		CostModel{}, Split{TrainEnd: at.Add(time.Hour), ValidationEnd: at.Add(2 * time.Hour)}, 2)
	if len(reports) != 1 || reports[0].Metrics.ProfitFactor != 0 {
		t.Fatalf("expected suppressed report: %+v", reports)
	}
}

func TestReportsKeepDecisionPopulationAndOutcomeKindsInFrozenBucket(t *testing.T) {
	at := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	reports := Reports([]Sample{
		{SignalID: "mark", OccurredAt: at, Setup: "MOMENTUM_SCALPER_TIER_A", ScoreBucket: "90_100", LiquidityTier: "A", Regime: "TREND_UP", DirectionBps: 20, Candidate: true, OutcomeSource: "PAPER_MARK"},
		{SignalID: "demo", OccurredAt: at.Add(time.Minute), Setup: "MOMENTUM_SCALPER_TIER_A", ScoreBucket: "90_100", LiquidityTier: "A", Regime: "TREND_UP", DirectionBps: 10, Candidate: true, OutcomeSource: "DEMO_REALIZED"},
		{SignalID: "reject", OccurredAt: at.Add(2 * time.Minute), Setup: "MOMENTUM_SCALPER_TIER_A", ScoreBucket: "90_100", LiquidityTier: "A", Regime: "TREND_UP", Missing: true, Rejected: true},
	}, CostModel{}, Split{TrainEnd: at.Add(time.Hour), ValidationEnd: at.Add(2 * time.Hour)}, 1)
	if len(reports) != 1 {
		t.Fatalf("got %d reports", len(reports))
	}
	report := reports[0]
	if report.Key != "MOMENTUM_SCALPER_TIER_A|90_100|TREND_UP|A" {
		t.Fatalf("unexpected frozen setup key: %q", report.Key)
	}
	if report.Metrics.Candidates != 2 || report.Metrics.Rejections != 1 || report.Metrics.PaperMarks != 1 || report.Metrics.DemoRealized != 1 || report.Metrics.Missing != 1 {
		t.Fatalf("lost decision or outcome population: %+v", report.Metrics)
	}
}

package signals

import (
	"bytes"
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRepositoryRecordsImmutableSignalAndDirectionAwareOutcome(t *testing.T) {
	repo, err := Open(filepath.Join(t.TempDir(), "signals.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()

	at := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	record := SignalRecord{
		ID: "signal-short", OccurredAt: at, Symbol: "TESTUSDT", Direction: "SHORT",
		Phase: "CONFIRMED", Detector: "test", Price: 100, FeatureVersion: "training-features/v1", LabelVersion: "outcome-label/v1", LabelCostBps: 25,
		Features: TrainingFeatures{FeatureVersion: "training-features/v1", VolumeRatio: 4, MarketRegime: "TREND_UP", Score: 100, MultiTFScore: 100, MultiTFAvailable: true},
	}
	if err := repo.RecordSignal(context.Background(), record); err != nil {
		t.Fatal(err)
	}
	if err := repo.RecordSignal(context.Background(), record); err != nil {
		t.Fatalf("identical replay must be idempotent: %v", err)
	}
	conflict := record
	conflict.Price = 101
	if err := repo.RecordSignal(context.Background(), conflict); err == nil {
		t.Fatal("conflicting signal identity was accepted")
	}

	if err := repo.ObserveMark(context.Background(), record.Symbol, 98, "fixture", at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	outcomes, err := repo.Outcomes(context.Background(), record.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(outcomes) != len(Horizons) {
		t.Fatalf("got %d outcomes, want %d", len(outcomes), len(Horizons))
	}
	if outcomes[0].Status != OutcomeObserved || outcomes[0].ReturnBps != -200 || outcomes[0].DirectionBps != 200 ||
		outcomes[0].Label != "WIN" || outcomes[0].ProfitPercent == nil || *outcomes[0].ProfitPercent != 1.75 {
		t.Fatalf("unexpected short outcome: %#v", outcomes[0])
	}
	for _, outcome := range outcomes[1:] {
		if outcome.Status != OutcomePending {
			t.Fatalf("future horizon must remain pending: %#v", outcome)
		}
	}
	researchRows, err := repo.ResearchSamples(context.Background(), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(researchRows) != 1 || !researchRows[0].ExcursionsKnown || researchRows[0].MAEBps != 200 || researchRows[0].MFEBps != 200 || researchRows[0].ScoreBucket != "90_100" || researchRows[0].OutcomeSource != "PAPER_MARK" {
		t.Fatalf("unexpected research projection: %#v", researchRows)
	}
}

func TestTrainingFeaturesAreImmutableAndExportLabelsOnlyObservedOutcomes(t *testing.T) {
	repo, err := Open(filepath.Join(t.TempDir(), "signals.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()
	at := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	record := SignalRecord{
		ID: "training", OccurredAt: at, Symbol: "TESTUSDT", Direction: "LONG", Phase: "CONFIRMED", Detector: "test", Price: 100,
		FeatureVersion: "training-features/v1", LabelVersion: "outcome-label/v1",
		Features: TrainingFeatures{FeatureVersion: "training-features/v1", VolumeRatio: 5, OIChange: 2, PriceChange: 1, Funding: 0.01,
			Orderflow: 20, Spread: 0.02, ATR: 1.5, BTCChange: -0.5, MarketRegime: "RANGE", MultiTFScore: 0, MultiTFAvailable: false, MultiTFReason: "not enough confirmed candles"},
	}
	if err := repo.RecordSignal(context.Background(), record); err != nil {
		t.Fatal(err)
	}
	mutated := record
	mutated.Features = TrainingFeatures{FeatureVersion: "training-features/v1", VolumeRatio: 999}
	if err := repo.RecordSignal(context.Background(), mutated); err == nil {
		t.Fatal("changed immutable feature snapshot was accepted")
	}
	if err := repo.ObserveMark(context.Background(), record.Symbol, 101, "fixture", at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	costs := TrainingCosts{Version: "demo-linear/v1", EntryFeeBps: 10, ExitFeeBps: 10, SlippageBps: 5}
	rows, err := repo.TrainingRows(context.Background(), time.Minute, costs)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Label != "WIN" || rows[0].ProfitPercent == nil || *rows[0].ProfitPercent != 0.7 {
		t.Fatalf("unexpected observed training projection: %#v", rows)
	}
	if rows[0].Features.VolumeRatio != 5 || rows[0].Features.MarketRegime != "RANGE" || rows[0].Features.MultiTFAvailable {
		t.Fatalf("immutable T0 features changed: %#v", rows[0].Features)
	}
	if rows[0].CostVersion != costs.Version || rows[0].TotalCostBps != 30 {
		t.Fatalf("cost assumptions were not recorded in export row: %#v", rows[0])
	}
	if _, err := repo.TrainingRows(context.Background(), time.Hour, TrainingCosts{}); err == nil {
		t.Fatal("training export accepted an unversioned zero-cost model")
	}
	pending, err := repo.TrainingRows(context.Background(), time.Hour, costs)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].OutcomeStatus != OutcomePending || pending[0].Label != "" || pending[0].ProfitPercent != nil {
		t.Fatalf("pending outcome was given an invented label: %#v", pending)
	}
	var csv bytes.Buffer
	if err := WriteTrainingCSV(&csv, rows); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(csv.String(), "volume_ratio") || !strings.Contains(csv.String(), "market_regime") || !strings.Contains(csv.String(), "profit_percent") || !strings.Contains(csv.String(), "cost_version") {
		t.Fatalf("CSV missing required training fields: %s", csv.String())
	}
	var jsonl bytes.Buffer
	if err := WriteTrainingJSONL(&jsonl, rows); err != nil {
		t.Fatal(err)
	}
	var exported map[string]any
	if err := json.Unmarshal(jsonl.Bytes(), &exported); err != nil {
		t.Fatal(err)
	}
	if exported["label"] != "WIN" {
		t.Fatalf("unexpected JSONL label: %#v", exported)
	}
	if exported["cost_version"] != costs.Version || exported["total_cost_bps"] != float64(30) {
		t.Fatalf("JSONL omitted cost assumptions: %#v", exported)
	}
}

func TestRepositoryDecisionsAreIdempotentAndOutcomesCanBeMissing(t *testing.T) {
	repo, err := Open(filepath.Join(t.TempDir(), "signals.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()

	at := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	record := SignalRecord{
		ID: "child", ParentID: "parent", OccurredAt: at, Symbol: "TESTUSDT", Direction: "LONG",
		Phase: "INVALIDATED", Detector: "test", Price: 100,
	}
	if err := repo.RecordSignal(context.Background(), record); err != nil {
		t.Fatal(err)
	}
	decision := DecisionRecord{SignalID: record.ID, Stage: DecisionCooldown, Result: "REJECTED", At: at}
	if err := repo.RecordDecision(context.Background(), decision); err != nil {
		t.Fatal(err)
	}
	if err := repo.RecordDecision(context.Background(), decision); err != nil {
		t.Fatalf("same decision replay must be idempotent: %v", err)
	}
	decision.Result = "APPROVED"
	if err := repo.RecordDecision(context.Background(), decision); err == nil {
		t.Fatal("contradictory decision was accepted")
	}
	if err := repo.MarkMissing(context.Background(), at.Add(time.Hour+time.Minute), 0); err != nil {
		t.Fatal(err)
	}
	outcomes, err := repo.Outcomes(context.Background(), record.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, outcome := range outcomes {
		if outcome.Horizon <= time.Hour && outcome.Status != OutcomeMissing {
			t.Fatalf("elapsed outcome must be missing: %#v", outcome)
		}
	}
}

func TestResearchSamplesRetainFeatureDimensionsAndMissingOutcomes(t *testing.T) {
	repo, err := Open(filepath.Join(t.TempDir(), "signals.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()
	at := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	record := SignalRecord{
		ID: "research", OccurredAt: at, Symbol: "TESTUSDT", Direction: "LONG",
		Phase: "CONFIRMED", Detector: "test", Price: 100,
		Features: map[string]any{"setup": "BREAKOUT", "liquidity_tier": "A", "regime": "TREND_UP", "aggregate_order_id": "order-1"},
	}
	if err := repo.RecordSignal(context.Background(), record); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkMissing(context.Background(), at.Add(time.Hour+time.Minute), 0); err != nil {
		t.Fatal(err)
	}
	rows, err := repo.ResearchSamples(context.Background(), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Status != OutcomeMissing || rows[0].Setup != "BREAKOUT" || rows[0].AggregateOrderID != "order-1" {
		t.Fatalf("unexpected research rows: %#v", rows)
	}
}

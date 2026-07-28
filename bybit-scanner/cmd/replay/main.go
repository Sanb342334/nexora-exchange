// replay produces read-only, after-cost research reports from the signal
// ledger. Its output is advisory and cannot modify execution configuration.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"bybit-scanner/internal/research"
	"bybit-scanner/internal/signals"
)

func main() {
	logDir := flag.String("log-dir", "logs", "scanner log directory")
	horizon := flag.Duration("horizon", time.Hour, "outcome horizon (1m, 5m, 15m, or 1h)")
	costVersion := flag.String("cost-version", "", "required version for the after-cost model")
	entryFee := flag.String("entry-fee-bps", "", "required fixed entry fee in bps")
	exitFee := flag.String("exit-fee-bps", "", "required fixed exit fee in bps")
	slippage := flag.String("slippage-bps", "", "required fixed slippage per side in bps")
	purge := flag.Duration("purge-embargo", time.Hour, "purge/embargo around walk-forward boundaries")
	minimum := flag.Int("min-independent", 30, "minimum unique aggregate orders for ranking")
	trainEnd := flag.String("train-end", "", "RFC3339 train end (defaults deterministically from data)")
	validationEnd := flag.String("validation-end", "", "RFC3339 validation end (defaults deterministically from data)")
	policyVersion := flag.String("policy-version", "", "candidate policy version; advisory only")
	configHash := flag.String("config-hash", "", "immutable candidate configuration hash")
	minExpectancy := flag.Float64("min-expectancy-bps", 0, "minimum positive after-cost holdout expectancy")
	minPF := flag.Float64("min-profit-factor", 1.1, "minimum after-cost holdout profit factor")
	maxDrawdown := flag.Float64("max-drawdown-bps", 0, "maximum holdout drawdown in bps (zero requires no drawdown)")
	maxMissing := flag.Float64("max-missing-rate", 0.05, "maximum missing outcome rate")
	flag.Parse()

	costs, err := parseCostModel(*costVersion, *entryFee, *exitFee, *slippage)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid costs: %v\n", err)
		os.Exit(2)
	}
	repo, err := signals.OpenReadOnly(filepath.Join(*logDir, "signals.db"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "open signal ledger: %v\n", err)
		os.Exit(1)
	}
	defer repo.Close()
	rows, err := repo.ResearchSamples(context.Background(), *horizon)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load outcomes: %v\n", err)
		os.Exit(1)
	}
	samples := make([]research.Sample, 0, len(rows))
	for _, row := range rows {
		samples = append(samples, research.Sample{
			SignalID: row.SignalID, AggregateOrderID: row.AggregateOrderID, OccurredAt: row.OccurredAt,
			Setup: row.Setup, ScoreBucket: row.ScoreBucket, LiquidityTier: row.LiquidityTier, Regime: row.Regime,
			DirectionBps: row.DirectionBps, MAEBps: row.MAEBps, MFEBps: row.MFEBps,
			ExcursionsKnown: row.ExcursionsKnown, Missing: row.Status != signals.OutcomeObserved,
			Candidate: row.Candidate, Rejected: row.Rejected, OutcomeSource: row.OutcomeSource,
		})
	}
	split, err := walkForwardSplit(samples, *trainEnd, *validationEnd, *purge)
	if err != nil {
		fmt.Fprintf(os.Stderr, "walk-forward split: %v\n", err)
		os.Exit(2)
	}
	reports := research.Reports(samples, costs, split, *minimum)
	type promotionCandidate struct {
		Key      string                     `json:"key"`
		Decision research.PromotionDecision `json:"decision"`
	}
	var candidates []promotionCandidate
	gate := research.PromotionGate{
		Version: *policyVersion, ConfigHash: *configHash, MinimumIndependent: *minimum,
		MinimumExpectancyBps: *minExpectancy, MinimumProfitFactor: *minPF,
		MaximumDrawdownBps: *maxDrawdown, MaximumMissingRate: *maxMissing,
	}
	for _, report := range reports {
		if report.Partition == research.PartitionHoldout {
			candidates = append(candidates, promotionCandidate{Key: report.Key, Decision: gate.EvaluatePromotion(report.Metrics)})
		}
	}
	output := struct {
		Disclaimer          string               `json:"disclaimer"`
		Costs               research.CostModel   `json:"costs"`
		Split               research.Split       `json:"split"`
		Reports             []research.Report    `json:"reports"`
		PromotionCandidates []promotionCandidate `json:"promotion_candidates"`
	}{
		Disclaimer:          "Read-only candle/mark outcome research; it does not reproduce order-book or fill behavior and cannot enable execution.",
		Costs:               costs,
		Split:               split,
		Reports:             reports,
		PromotionCandidates: candidates,
	}
	if err := json.NewEncoder(os.Stdout).Encode(output); err != nil {
		fmt.Fprintf(os.Stderr, "write report: %v\n", err)
		os.Exit(1)
	}
}

func parseCostModel(version, entry, exit, slippage string) (research.CostModel, error) {
	if strings.TrimSpace(version) == "" || entry == "" || exit == "" || slippage == "" {
		return research.CostModel{}, fmt.Errorf("--cost-version, --entry-fee-bps, --exit-fee-bps, and --slippage-bps are all required")
	}
	parse := func(name, raw string) (float64, error) {
		value, err := strconv.ParseFloat(raw, 64)
		if err != nil || value < 0 {
			return 0, fmt.Errorf("%s must be a non-negative number", name)
		}
		return value, nil
	}
	entryFee, err := parse("entry fee", entry)
	if err != nil {
		return research.CostModel{}, err
	}
	exitFee, err := parse("exit fee", exit)
	if err != nil {
		return research.CostModel{}, err
	}
	slippageBps, err := parse("slippage", slippage)
	if err != nil {
		return research.CostModel{}, err
	}
	costs := research.CostModel{Version: version, EntryFeeBps: entryFee, ExitFeeBps: exitFee, SlippageBps: slippageBps}
	costs.RoundTripBps = costs.TotalBps()
	if costs.RoundTripBps <= 0 {
		return research.CostModel{}, fmt.Errorf("costs must be positive; zero-cost replay is unsafe")
	}
	return costs, nil
}

func walkForwardSplit(samples []research.Sample, trainEndRaw, validationEndRaw string, purge time.Duration) (research.Split, error) {
	if len(samples) == 0 {
		return research.Split{}, fmt.Errorf("no outcomes at selected horizon")
	}
	parse := func(raw string) (time.Time, error) {
		if raw == "" {
			return time.Time{}, nil
		}
		return time.Parse(time.RFC3339, raw)
	}
	trainEnd, err := parse(trainEndRaw)
	if err != nil {
		return research.Split{}, err
	}
	validationEnd, err := parse(validationEndRaw)
	if err != nil {
		return research.Split{}, err
	}
	first, last := samples[0].OccurredAt, samples[len(samples)-1].OccurredAt
	if trainEnd.IsZero() {
		trainEnd = first.Add(last.Sub(first) * 60 / 100)
	}
	if validationEnd.IsZero() {
		validationEnd = first.Add(last.Sub(first) * 80 / 100)
	}
	if !validationEnd.After(trainEnd) {
		return research.Split{}, fmt.Errorf("validation end must be after train end")
	}
	return research.Split{TrainEnd: trainEnd, ValidationEnd: validationEnd, HoldoutEnd: last.Add(time.Nanosecond), PurgeAndEmbargo: purge}, nil
}

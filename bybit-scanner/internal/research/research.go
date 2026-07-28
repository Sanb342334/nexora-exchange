// Package research provides deterministic, read-only evaluation of signal
// outcomes. It deliberately has no dependency on execution packages.
package research

import (
	"math"
	"sort"
	"time"
)

type CostModel struct {
	Version      string  `json:"version"`
	EntryFeeBps  float64 `json:"entry_fee_bps"`
	ExitFeeBps   float64 `json:"exit_fee_bps"`
	SlippageBps  float64 `json:"slippage_bps"`
	RoundTripBps float64 `json:"round_trip_bps"`
}

func (c CostModel) TotalBps() float64 {
	return c.EntryFeeBps + c.ExitFeeBps + 2*c.SlippageBps
}

type Sample struct {
	SignalID         string
	AggregateOrderID string
	OccurredAt       time.Time
	Setup            string
	LiquidityTier    string
	Regime           string
	ScoreBucket      string
	DirectionBps     float64
	MAEBps           float64
	MFEBps           float64
	ExcursionsKnown  bool
	Missing          bool
	// Candidate and Rejected retain the decision population, rather than
	// silently evaluating only selected trades.
	Candidate bool
	Rejected  bool
	// OutcomeSource is PAPER_MARK or DEMO_REALIZED. Unknown sources remain
	// observable but are never treated as realized demo performance.
	OutcomeSource string
}

type Split struct {
	TrainEnd        time.Time
	ValidationEnd   time.Time
	HoldoutEnd      time.Time
	PurgeAndEmbargo time.Duration
}

type Partition string

const (
	PartitionTrain      Partition = "TRAIN"
	PartitionValidation Partition = "VALIDATION"
	PartitionHoldout    Partition = "HOLDOUT"
	PartitionExcluded   Partition = "EXCLUDED"
)

// Assign partitions by event time. Events within a purge/embargo interval
// around either boundary are excluded, preventing horizon overlap leakage.
func (s Split) Assign(at time.Time) Partition {
	if at.IsZero() || s.TrainEnd.IsZero() || s.ValidationEnd.IsZero() {
		return PartitionExcluded
	}
	if at.Before(s.TrainEnd.Add(-s.PurgeAndEmbargo)) {
		return PartitionTrain
	}
	if at.Before(s.TrainEnd.Add(s.PurgeAndEmbargo)) {
		return PartitionExcluded
	}
	if at.Before(s.ValidationEnd.Add(-s.PurgeAndEmbargo)) {
		return PartitionValidation
	}
	if at.Before(s.ValidationEnd.Add(s.PurgeAndEmbargo)) {
		return PartitionExcluded
	}
	if s.HoldoutEnd.IsZero() || at.Before(s.HoldoutEnd) {
		return PartitionHoldout
	}
	return PartitionExcluded
}

type Metrics struct {
	Observed            int
	Missing             int
	EffectiveSampleSize int
	Wins                int
	Losses              int
	Candidates          int
	Rejections          int
	PaperMarks          int
	DemoRealized        int
	ExpectancyBps       float64
	ProfitFactor        float64
	MaxDrawdownBps      float64
	AverageMAEBps       float64
	AverageMFEBps       float64
	ExcursionSampleSize int
	WinRate             float64
	WilsonLow           float64
	WilsonHigh          float64
}

type Report struct {
	Key       string
	Partition Partition
	Metrics   Metrics
}

// Evaluate applies the fixed round-trip cost model, then aggregates repeated
// virtual allocations of one exchange order into one independent observation.
func Evaluate(samples []Sample, costs CostModel) Metrics {
	m := Metrics{}
	type aggregate struct {
		at         time.Time
		pnl        float64
		mae        float64
		mfe        float64
		n          int
		excursionN int
	}
	byOrder := make(map[string]aggregate)
	for _, sample := range samples {
		if sample.Candidate {
			m.Candidates++
		}
		if sample.Rejected {
			m.Rejections++
		}
		switch sample.OutcomeSource {
		case "PAPER_MARK":
			m.PaperMarks++
		case "DEMO_REALIZED":
			m.DemoRealized++
		}
		if sample.Missing {
			m.Missing++
			continue
		}
		m.Observed++
		key := sample.AggregateOrderID
		if key == "" {
			key = "signal:" + sample.SignalID
		}
		net := sample.DirectionBps - costs.TotalBps()
		current, exists := byOrder[key]
		if !exists || sample.OccurredAt.Before(current.at) {
			current.at = sample.OccurredAt
		}
		current.pnl += net
		if sample.ExcursionsKnown {
			current.mae += sample.MAEBps
			current.mfe += sample.MFEBps
			current.excursionN++
		}
		current.n++
		byOrder[key] = current
	}
	rows := make([]aggregate, 0, len(byOrder))
	for _, row := range byOrder {
		if row.n > 1 {
			row.pnl /= float64(row.n)
		}
		if row.excursionN > 0 {
			row.mae /= float64(row.excursionN)
			row.mfe /= float64(row.excursionN)
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].at.Before(rows[j].at) })
	m.EffectiveSampleSize = len(rows)
	if len(rows) == 0 {
		return m
	}
	var grossProfit, grossLoss, equity, peak float64
	for _, row := range rows {
		m.ExpectancyBps += row.pnl
		if row.excursionN > 0 {
			m.AverageMAEBps += row.mae
			m.AverageMFEBps += row.mfe
			m.ExcursionSampleSize++
		}
		if row.pnl > 0 {
			m.Wins++
			grossProfit += row.pnl
		} else if row.pnl < 0 {
			m.Losses++
			grossLoss -= row.pnl
		}
		equity += row.pnl
		if equity > peak {
			peak = equity
		}
		m.MaxDrawdownBps = math.Max(m.MaxDrawdownBps, peak-equity)
	}
	n := float64(m.EffectiveSampleSize)
	m.ExpectancyBps /= n
	if m.ExcursionSampleSize > 0 {
		m.AverageMAEBps /= float64(m.ExcursionSampleSize)
		m.AverageMFEBps /= float64(m.ExcursionSampleSize)
	}
	m.WinRate = float64(m.Wins) / n
	if grossLoss == 0 {
		if grossProfit > 0 {
			m.ProfitFactor = math.Inf(1)
		}
	} else {
		m.ProfitFactor = grossProfit / grossLoss
	}
	m.WilsonLow, m.WilsonHigh = wilson(m.Wins, m.EffectiveSampleSize)
	return m
}

func Reports(samples []Sample, costs CostModel, split Split, minimumIndependent int) []Report {
	type group struct {
		partition Partition
		key       string
	}
	groups := make(map[group][]Sample)
	for _, sample := range samples {
		partition := split.Assign(sample.OccurredAt)
		if partition == PartitionExcluded {
			continue
		}
		key := sample.Setup + "|" + scoreBucket(sample.ScoreBucket) + "|" + sample.Regime + "|" + sample.LiquidityTier
		groups[group{partition, key}] = append(groups[group{partition, key}], sample)
	}
	out := make([]Report, 0, len(groups))
	for key, rows := range groups {
		metrics := Evaluate(rows, costs)
		// Ranking consumers must use EffectiveSampleSize to suppress
		// underpowered reports. Keeping the metrics makes the omission auditable.
		if metrics.EffectiveSampleSize < minimumIndependent {
			metrics.ProfitFactor = 0
		}
		out = append(out, Report{Key: key.key, Partition: key.partition, Metrics: metrics})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Partition == out[j].Partition {
			return out[i].Key < out[j].Key
		}
		return out[i].Partition < out[j].Partition
	})
	return out
}

func scoreBucket(bucket string) string {
	if bucket == "" {
		return "UNBUCKETED"
	}
	return bucket
}

func wilson(wins, n int) (float64, float64) {
	if n == 0 {
		return 0, 0
	}
	const z = 1.959963984540054
	p := float64(wins) / float64(n)
	denom := 1 + z*z/float64(n)
	center := (p + z*z/(2*float64(n))) / denom
	margin := z * math.Sqrt((p*(1-p)+z*z/(4*float64(n)))/float64(n)) / denom
	return math.Max(0, center-margin), math.Min(1, center+margin)
}

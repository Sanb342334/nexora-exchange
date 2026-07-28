package research

import (
	"context"
	"time"
)

// Clock and EventSource make fixture replays deterministic. Production feeds
// are intentionally not adapted here: candle-only research must not claim to
// reproduce order-book or fill behaviour.
type Clock interface {
	Now() time.Time
}

type Event struct {
	At     time.Time
	Sample Sample
}

type EventSource interface {
	Next(context.Context) (Event, bool, error)
}

type ReplayResult struct {
	Samples []Sample
}

func Replay(ctx context.Context, clock Clock, source EventSource, until time.Time) (ReplayResult, error) {
	var result ReplayResult
	for {
		event, ok, err := source.Next(ctx)
		if err != nil {
			return ReplayResult{}, err
		}
		if !ok || (!until.IsZero() && event.At.After(until)) {
			return result, nil
		}
		if !clock.Now().IsZero() && event.At.After(clock.Now()) {
			return result, nil
		}
		event.Sample.OccurredAt = event.At.UTC()
		result.Samples = append(result.Samples, event.Sample)
	}
}

type PromotionGate struct {
	Version              string
	ConfigHash           string
	MinimumIndependent   int
	MinimumExpectancyBps float64
	MinimumProfitFactor  float64
	MaximumDrawdownBps   float64
	MaximumMissingRate   float64
}

type PromotionDecision struct {
	Eligible       bool
	RequiresManual bool
	Version        string
	ConfigHash     string
	Reasons        []string
}

// EvaluatePromotion is an offline evidence gate. Eligibility only makes a
// version available for a manual shadow/paper promotion; it never enables an
// execution mode.
func (g PromotionGate) EvaluatePromotion(holdout Metrics) PromotionDecision {
	d := PromotionDecision{RequiresManual: true, Version: g.Version, ConfigHash: g.ConfigHash}
	if g.Version == "" || g.ConfigHash == "" {
		d.Reasons = append(d.Reasons, "version and config hash are required")
	}
	if holdout.EffectiveSampleSize < g.MinimumIndependent {
		d.Reasons = append(d.Reasons, "insufficient independent holdout sample")
	}
	if holdout.ExpectancyBps <= g.MinimumExpectancyBps {
		d.Reasons = append(d.Reasons, "after-cost holdout expectancy is not positive enough")
	}
	if holdout.ProfitFactor < g.MinimumProfitFactor {
		d.Reasons = append(d.Reasons, "after-cost holdout profit factor is below threshold")
	}
	if holdout.MaxDrawdownBps > g.MaximumDrawdownBps {
		d.Reasons = append(d.Reasons, "holdout drawdown exceeds threshold")
	}
	total := holdout.Observed + holdout.Missing
	if total > 0 && float64(holdout.Missing)/float64(total) > g.MaximumMissingRate {
		d.Reasons = append(d.Reasons, "missing outcome rate exceeds threshold")
	}
	d.Eligible = len(d.Reasons) == 0
	return d
}

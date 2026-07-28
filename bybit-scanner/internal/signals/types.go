// Package signals stores an append-only audit trail for detector signals.
package signals

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

const (
	DecisionCandidate = "CANDIDATE"
	DecisionVeto      = "VETO"
	DecisionCooldown  = "COOLDOWN"
	DecisionProfile   = "PROFILE_RISK"
	DecisionQueue     = "QUEUE"
	DecisionExecution = "EXECUTION"
	// DecisionPerformanceGate records a manual promotion or kill review. It is
	// audit-only and never authorizes an execution mode.
	DecisionPerformanceGate = "PERFORMANCE_GATE"
	// DecisionQualityShadow is audit-only. Its result never authorizes,
	// rejects, or modifies the legacy directional execution decision.
	DecisionQualityShadow = "QUALITY_SHADOW"

	OutcomePending  = "PENDING"
	OutcomeObserved = "OBSERVED"
	OutcomeMissing  = "MISSING"
)

var Horizons = []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour}

// SignalRecord is immutable after its first successful insert. Feature and
// explanation snapshots are JSON so future detector versions can add fields
// without altering historical data.
type SignalRecord struct {
	ID               string
	ParentID         string
	OccurredAt       time.Time
	Symbol           string
	Direction        string
	Phase            string
	Detector         string
	Price            float64
	FeatureVersion   string
	LabelVersion     string
	LabelCostVersion string
	LabelCostBps     float64
	Features         any
	Explanation      any
}

type DecisionRecord struct {
	SignalID string
	Stage    string
	Result   string
	Details  any
	At       time.Time
}

type Outcome struct {
	SignalID      string
	Horizon       time.Duration
	Status        string
	EntryPrice    float64
	MarkPrice     float64
	ReturnBps     float64
	DirectionBps  float64
	Source        string
	SourceAt      time.Time
	ObservedAt    time.Time
	Label         string
	ProfitPercent *float64
	LabelVersion  string
}

// TrainingFeatures is the point-in-time feature contract for offline training.
// Values are copied at signal T0 and never derived from later market data.
type TrainingFeatures struct {
	FeatureVersion   string  `json:"feature_version"`
	VolumeRatio      float64 `json:"volume_ratio"`
	OIChange         float64 `json:"oi_change"`
	PriceChange      float64 `json:"price_change"`
	Funding          float64 `json:"funding"`
	Orderflow        float64 `json:"orderflow"`
	Spread           float64 `json:"spread"`
	ATR              float64 `json:"atr"`
	BTCChange        float64 `json:"btc_change"`
	MarketRegime     string  `json:"market_regime"`
	MultiTFScore     float64 `json:"multitf_score"`
	MultiTFAvailable bool    `json:"multitf_available"`
	MultiTFReason    string  `json:"multitf_reason,omitempty"`
	Setup            string  `json:"setup"`
	Score            int     `json:"score"`
	// ScoreBucket is assigned at T0 and is never recomputed from mutable
	// thresholds, preserving the bucket used for performance reporting.
	ScoreBucket      string  `json:"score_bucket"`
	LiquidityTier    string  `json:"liquidity_tier"`
	LabelCostBps     float64 `json:"label_cost_bps"`
	LabelCostVersion string  `json:"label_cost_version"`
}

// TrainingCosts are explicitly supplied to a read-only export. The total is
// charged on both entry and exit so researchers cannot accidentally treat
// gross returns as after-cost labels.
type TrainingCosts struct {
	Version     string
	EntryFeeBps float64
	ExitFeeBps  float64
	SlippageBps float64
}

func (c TrainingCosts) TotalBps() float64 {
	return c.EntryFeeBps + c.ExitFeeBps + 2*c.SlippageBps
}

type TrainingRow struct {
	SignalID       string           `json:"signal_id"`
	OccurredAt     time.Time        `json:"occurred_at"`
	Symbol         string           `json:"symbol"`
	Direction      string           `json:"direction"`
	Phase          string           `json:"phase"`
	Horizon        time.Duration    `json:"-"`
	HorizonSeconds int64            `json:"horizon_seconds"`
	OutcomeStatus  string           `json:"outcome_status"`
	Features       TrainingFeatures `json:"features"`
	Label          string           `json:"label,omitempty"`
	ProfitPercent  *float64         `json:"profit_percent,omitempty"`
	LabelVersion   string           `json:"label_version,omitempty"`
	CostVersion    string           `json:"cost_version"`
	EntryFeeBps    float64          `json:"entry_fee_bps"`
	ExitFeeBps     float64          `json:"exit_fee_bps"`
	SlippageBps    float64          `json:"slippage_bps"`
	TotalCostBps   float64          `json:"total_cost_bps"`
}

// ResearchSample is a ledger projection for offline evaluation. Metadata is
// recovered from the immutable feature snapshot so schema evolution does not
// rewrite historical signals.
type ResearchSample struct {
	SignalID         string
	AggregateOrderID string
	OccurredAt       time.Time
	Setup            string
	LiquidityTier    string
	Regime           string
	ScoreBucket      string
	DirectionBps     float64
	Status           string
	OutcomeSource    string
	Candidate        bool
	Rejected         bool
	MAEBps           float64
	MFEBps           float64
	ExcursionsKnown  bool
}

func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failures are exceptional, but a time component prevents
		// collision in the fallback without making identity timestamp-based.
		return fmt.Sprintf("sig-%d", time.Now().UTC().UnixNano())
	}
	return "sig-" + hex.EncodeToString(b[:])
}

func marshalSnapshot(v any) ([]byte, error) {
	if v == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(v)
}

// Package quality evaluates explainable setup quality in shadow mode.
// Its assessments are audit records only: no caller may use them to relax
// legacy strategy, risk, execution, or safety rules without a later promotion.
package quality

import (
	"fmt"
	"math"
	"time"

	"bybit-scanner/internal/analyzer"
)

const (
	Version = "quality-shadow-v1"

	Available   Availability = "AVAILABLE"
	Unavailable Availability = "UNAVAILABLE"
	Stale       Availability = "STALE"
)

type Availability string

// Factor records a single, reproducible contribution. Score is informational:
// unavailable and stale inputs always contribute zero.
type Factor struct {
	Name         string       `json:"name"`
	Availability Availability `json:"availability"`
	Value        float64      `json:"value,omitempty"`
	Score        int          `json:"score"`
	Reason       string       `json:"reason"`
}

// Veto is a hard quality warning. In shadow mode it never blocks an order.
type Veto struct {
	Code   string `json:"code"`
	Reason string `json:"reason"`
	Hard   bool   `json:"hard"`
}

type Assessment struct {
	Version       string                   `json:"version"`
	Mode          string                   `json:"mode"`
	Setup         string                   `json:"setup"`
	Direction     string                   `json:"direction"`
	AssessedAt    time.Time                `json:"assessed_at"`
	LegacyScore   int                      `json:"legacy_score"`
	Score         int                      `json:"score"`
	Freshness     map[string]Availability  `json:"freshness"`
	Factors       []Factor                 `json:"factors"`
	Vetoes        []Veto                   `json:"vetoes"`
	Warnings      []string                 `json:"warnings"`
	FeatureSource analyzer.QualitySnapshot `json:"feature_source"`
}

type Policy struct {
	TickerMaxAge time.Duration
	OIMaxAge     time.Duration
	TradeMaxAge  time.Duration
	KlineMaxAge  time.Duration
	MaxSpreadPct float64
}

func DefaultPolicy() Policy {
	return Policy{
		TickerMaxAge: 3 * time.Second, OIMaxAge: 30 * time.Second,
		TradeMaxAge: 5 * time.Second, KlineMaxAge: 90 * time.Second,
		MaxSpreadPct: 0.35,
	}
}

type Engine struct{ policy Policy }

func New(policy Policy) *Engine {
	if policy.TickerMaxAge <= 0 {
		policy = DefaultPolicy()
	}
	return &Engine{policy: policy}
}

func NewDefault() *Engine { return New(DefaultPolicy()) }

// Assess is deterministic for a signal/snapshot pair. It is intentionally
// side-effect-free so it can be replayed and persisted as an immutable audit.
func (e *Engine) Assess(sig analyzer.Signal, snapshot analyzer.QualitySnapshot) Assessment {
	now := snapshot.ObservedAt
	if now.IsZero() {
		now = sig.Timestamp
	}
	a := Assessment{
		Version: Version, Mode: "SHADOW", Setup: sig.SetupType, Direction: direction(sig),
		AssessedAt: now, LegacyScore: sig.Score, Freshness: make(map[string]Availability), FeatureSource: snapshot,
	}
	a.Freshness["ticker"] = freshness(snapshot.TickerAt, now, e.policy.TickerMaxAge)
	a.Freshness["open_interest"] = freshness(snapshot.OIAt, now, e.policy.OIMaxAge)
	a.Freshness["trade_flow"] = freshness(snapshot.TradeAt, now, e.policy.TradeMaxAge)
	a.Freshness["candle"] = freshness(snapshot.KlineAt, now, e.policy.KlineMaxAge)

	a.addTicker(snapshot)
	a.addFlow(sig, snapshot)
	a.addOI(sig, snapshot)
	a.addCandle(snapshot)
	a.addVetoes(sig, snapshot, e.policy)
	for _, factor := range a.Factors {
		a.Score += factor.Score
	}
	if a.Score > 100 {
		a.Score = 100
	}
	return a
}

func (a *Assessment) addTicker(s analyzer.QualitySnapshot) {
	status := a.Freshness["ticker"]
	if status != Available {
		a.Factors = append(a.Factors, unavailableFactor("spread", status))
		return
	}
	if s.SpreadPct <= 0 {
		a.Factors = append(a.Factors, Factor{Name: "spread", Availability: Unavailable, Reason: "bid/ask unavailable"})
		return
	}
	score := 8
	if s.SpreadPct > 0.15 {
		score = 3
	}
	a.Factors = append(a.Factors, Factor{Name: "spread", Availability: Available, Value: s.SpreadPct, Score: score, Reason: fmt.Sprintf("spread %.3f%%", s.SpreadPct)})
}

func (a *Assessment) addFlow(sig analyzer.Signal, s analyzer.QualitySnapshot) {
	status := a.Freshness["trade_flow"]
	if status != Available {
		a.Factors = append(a.Factors, unavailableFactor("signed_trade_flow", status))
		return
	}
	total := s.TradeBuyUSDT + s.TradeSellUSDT
	if total <= 0 {
		a.Factors = append(a.Factors, Factor{Name: "signed_trade_flow", Availability: Unavailable, Reason: "no trades in rolling window"})
		return
	}
	imbalance := s.TradeDeltaUSDT / total
	aligned := (a.Direction == "LONG" && imbalance > 0) || (a.Direction == "SHORT" && imbalance < 0)
	score := 0
	reason := fmt.Sprintf("flow imbalance %.1f%%", imbalance*100)
	if aligned {
		score = int(math.Min(20, math.Abs(imbalance)*25))
		reason += " aligns with direction"
	} else {
		a.Warnings = append(a.Warnings, "flow contradicts direction")
	}
	a.Factors = append(a.Factors, Factor{Name: "signed_trade_flow", Availability: Available, Value: imbalance, Score: score, Reason: reason})
}

func (a *Assessment) addOI(sig analyzer.Signal, s analyzer.QualitySnapshot) {
	status := a.Freshness["open_interest"]
	if status != Available {
		a.Factors = append(a.Factors, unavailableFactor("open_interest", status))
		return
	}
	if s.OIChange3m == 0 {
		a.Factors = append(a.Factors, Factor{Name: "open_interest", Availability: Unavailable, Reason: "insufficient OI history"})
		return
	}
	aligned := (a.Direction == "LONG" && s.OIChange3m > 0) || (a.Direction == "SHORT" && s.OIChange3m < 0)
	score := 0
	if aligned {
		score = int(math.Min(15, math.Abs(s.OIChange3m)*3))
	}
	a.Factors = append(a.Factors, Factor{Name: "open_interest", Availability: Available, Value: s.OIChange3m, Score: score, Reason: fmt.Sprintf("OI 3m %.2f%%", s.OIChange3m)})
}

func (a *Assessment) addCandle(s analyzer.QualitySnapshot) {
	status := a.Freshness["candle"]
	if status != Available {
		a.Factors = append(a.Factors, unavailableFactor("partial_candle", status))
		return
	}
	if s.Candle.Open <= 0 || s.NormalizedVolumeUSDT <= 0 {
		a.Factors = append(a.Factors, Factor{Name: "partial_candle", Availability: Unavailable, Reason: "candle fields unavailable"})
		return
	}
	change := (s.Candle.Close - s.Candle.Open) / s.Candle.Open * 100
	a.Factors = append(a.Factors, Factor{Name: "partial_candle", Availability: Available, Value: change, Score: 5, Reason: fmt.Sprintf("normalized 1m turnover $%.0f", s.NormalizedVolumeUSDT)})
}

func (a *Assessment) addVetoes(sig analyzer.Signal, s analyzer.QualitySnapshot, policy Policy) {
	if a.Freshness["ticker"] != Available {
		a.Vetoes = append(a.Vetoes, Veto{Code: "STALE_TICKER", Reason: "executable ticker is unavailable or stale", Hard: true})
	}
	if a.Freshness["trade_flow"] != Available {
		a.Vetoes = append(a.Vetoes, Veto{Code: "STALE_TRADE_FLOW", Reason: "signed trade flow is unavailable or stale", Hard: true})
	}
	if a.Freshness["ticker"] == Available && s.SpreadPct > policy.MaxSpreadPct {
		a.Vetoes = append(a.Vetoes, Veto{Code: "WIDE_SPREAD", Reason: fmt.Sprintf("spread %.3f%% exceeds shadow limit", s.SpreadPct), Hard: true})
	}
	if a.Freshness["trade_flow"] == Available && ((a.Direction == "LONG" && s.TradeDeltaUSDT < 0) || (a.Direction == "SHORT" && s.TradeDeltaUSDT > 0)) {
		a.Vetoes = append(a.Vetoes, Veto{Code: "FLOW_CONTRADICTION", Reason: "signed flow contradicts setup direction", Hard: true})
	}
	if a.Freshness["open_interest"] == Available && ((a.Direction == "LONG" && s.OIChange3m < 0) || (a.Direction == "SHORT" && s.OIChange3m > 0)) {
		a.Warnings = append(a.Warnings, "possible exhaustion: OI moves against direction")
	}
	if math.Abs(sig.PriceChange1m) > 0.75 && s.Liquidation1mUSDT == 0 {
		a.Warnings = append(a.Warnings, "possible trap: sharp move lacks liquidation confirmation")
	}
}

func direction(sig analyzer.Signal) string {
	if sig.TradeAction == "SHORT" || sig.Movement == "DUMP" {
		return "SHORT"
	}
	return "LONG"
}

func freshness(at, now time.Time, maxAge time.Duration) Availability {
	if at.IsZero() {
		return Unavailable
	}
	if now.Sub(at) > maxAge || at.After(now.Add(maxAge)) {
		return Stale
	}
	return Available
}

func unavailableFactor(name string, status Availability) Factor {
	return Factor{Name: name, Availability: status, Reason: string(status) + " input; no positive weight"}
}

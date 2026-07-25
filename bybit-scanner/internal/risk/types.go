package risk

import (
	"time"

	"bybit-scanner/internal/analyzer"
)

type Side string

const (
	SideLong  Side = "LONG"
	SideShort Side = "SHORT"
)

type Verdict string

const (
	VerdictApproved   Verdict = "APPROVED"
	VerdictReduced    Verdict = "REDUCED"
	VerdictRejected   Verdict = "REJECTED"
	VerdictKillSwitch Verdict = "KILL_SWITCH"
)

type TradingMode string

const (
	ModeDemo TradingMode = "DEMO"
	ModeLive TradingMode = "LIVE"
)

type TradeRecommendation struct {
	Signal analyzer.Signal

	Side           Side
	Mode           TradingMode
	Entry          float64
	StopLoss       float64
	TakeProfit     float64
	SLMethod       string
	TPMethod       string
	RiskReward     float64
	SLDistancePct  float64
	TPDistancePct  float64
	Leverage       int
	LeverageReason string
	NotionalUSDT   float64
	MarginUSDT     float64
	RiskUSDT       float64
	RiskPct        float64
	Qty            float64
	LiqPrice       float64
	LiqDistancePct float64
	SLToLiqBuffer  float64
	Verdict        Verdict
	RejectReasons  []string
	Warnings       []string
	OpenPositions  int
	MaxPositions   int
	Bucket         string
	BucketSameSide int
	BucketMax      int
	Timestamp      time.Time
}

func (r TradeRecommendation) Approved() bool {
	return r.Verdict == VerdictApproved || r.Verdict == VerdictReduced
}

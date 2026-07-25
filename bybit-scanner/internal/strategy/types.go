package strategy

import "bybit-scanner/internal/analyzer"

const (
	AlertImpulse   = "IMPULSE"
	AlertConfirmed = "CONFIRMED"
	AlertFade      = "FADE"
	AlertHot       = "HOT"

	ActionLong  = "LONG"
	ActionShort = "SHORT"
)

// Outcome is a strategy-layer decision ready for risk evaluation.
type Outcome struct {
	Signal      analyzer.Signal
	Tradeable   bool // false = watch-only (IMPULSE)
	CooldownKey string
}

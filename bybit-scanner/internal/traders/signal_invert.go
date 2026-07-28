package traders

import (
	"math"

	"bybit-scanner/internal/analyzer"
)

// InvertSignal flips directional intent while preserving the original signal
// identity for ledger audit. Used by contrarian profiles that trade against
// the legacy detector direction.
func InvertSignal(sig analyzer.Signal) analyzer.Signal {
	out := sig
	switch sig.TradeAction {
	case "LONG":
		out.TradeAction = "SHORT"
	case "SHORT":
		out.TradeAction = "LONG"
	}
	switch sig.Movement {
	case "PUMP":
		out.Movement = "DUMP"
	case "DUMP":
		out.Movement = "PUMP"
	}
	out.SetupType = invertSetupType(sig.SetupType)
	if sig.Price > 0 && sig.SuggestedSL > 0 && sig.SuggestedTP > 0 {
		distSL := math.Abs(sig.Price - sig.SuggestedSL)
		distTP := math.Abs(sig.SuggestedTP - sig.Price)
		long := sig.TradeAction == "LONG" || (sig.TradeAction == "" && sig.Movement == "PUMP")
		if long {
			out.SuggestedSL = sig.Price + distSL
			out.SuggestedTP = sig.Price - distTP
		} else {
			out.SuggestedSL = sig.Price - distSL
			out.SuggestedTP = sig.Price + distTP
		}
	}
	return out
}

func invertSetupType(setup string) string {
	switch setup {
	case "FADE_LONG":
		return "FADE_SHORT"
	case "FADE_SHORT":
		return "FADE_LONG"
	case "LONG_LIQUIDATION":
		return "SHORT_SQUEEZE"
	case "SHORT_SQUEEZE":
		return "LONG_LIQUIDATION"
	case "OVERLEVERAGED_LONGS":
		return "OVERLEVERAGED_SHORTS"
	case "OVERLEVERAGED_SHORTS":
		return "OVERLEVERAGED_LONGS"
	default:
		return setup
	}
}

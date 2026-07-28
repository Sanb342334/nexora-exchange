package execution

import (
	"math"
	"strings"
	"time"

	"bybit-scanner/internal/config"
)

// ManagedDemoPosition is durable bot-owned context. It is deliberately not
// inferred from arbitrary exchange positions.
type ManagedDemoPosition struct {
	IntentID     string
	OrderID      string
	Symbol       string
	Side         string
	EntryPrice   float64
	OriginalStop float64
	OriginalTP   float64
}

type ExitAdjustment struct {
	StopLoss   float64
	TakeProfit float64
	ChangeStop bool
	ChangeTP   bool
	R          float64
}

// CalculateExitAdjustment is pure. It only returns moves that improve the
// exchange's current protection; callers preserve unchanged protection fields.
func CalculateExitAdjustment(policy config.AdaptiveExitConfig, position ManagedDemoPosition, currentStop, currentTP, price float64) ExitAdjustment {
	if !policy.Enabled || position.EntryPrice <= 0 || position.OriginalStop <= 0 || price <= 0 {
		return ExitAdjustment{}
	}
	long := strings.EqualFold(position.Side, "Buy")
	if !long && !strings.EqualFold(position.Side, "Sell") {
		return ExitAdjustment{}
	}
	risk := math.Abs(position.EntryPrice - position.OriginalStop)
	if risk <= 0 {
		return ExitAdjustment{}
	}
	r := (price - position.EntryPrice) / risk
	if !long {
		r = -r
	}
	if r < 0 {
		return ExitAdjustment{R: r}
	}

	out := ExitAdjustment{R: r}
	candidateStop := currentStop
	if r >= policy.BreakevenAtR {
		lock := position.EntryPrice + policy.BreakevenLockR*risk
		if !long {
			lock = position.EntryPrice - policy.BreakevenLockR*risk
		}
		candidateStop = favorableStop(long, candidateStop, lock)
	}
	if r >= policy.TrailStartR {
		trail := price - policy.TrailDistanceR*risk
		if !long {
			trail = price + policy.TrailDistanceR*risk
		}
		candidateStop = favorableStop(long, candidateStop, trail)
	}
	if stopImproves(long, currentStop, candidateStop) && math.Abs(candidateStop-currentStop) >= policy.MinStopStepR*risk {
		out.StopLoss, out.ChangeStop = candidateStop, true
	}

	// A TP extension is allowed only after the currently active or newly
	// proposed stop has locked a profit. It never reduces a favorable TP.
	effectiveStop := currentStop
	if out.ChangeStop {
		effectiveStop = out.StopLoss
	}
	locked := (long && effectiveStop > position.EntryPrice) || (!long && effectiveStop < position.EntryPrice)
	if r >= policy.TPExtendAtR && locked {
		targetTP := position.EntryPrice + policy.TPExtendToR*risk
		if !long {
			targetTP = position.EntryPrice - policy.TPExtendToR*risk
		}
		if tpImproves(long, currentTP, targetTP) {
			out.TakeProfit, out.ChangeTP = targetTP, true
		}
	}
	return out
}

func favorableStop(long bool, current, candidate float64) float64 {
	if current <= 0 || stopImproves(long, current, candidate) {
		return candidate
	}
	return current
}

func stopImproves(long bool, current, candidate float64) bool {
	if candidate <= 0 {
		return false
	}
	if current <= 0 {
		return true
	}
	if long {
		return candidate > current
	}
	return candidate < current
}

func tpImproves(long bool, current, candidate float64) bool {
	if candidate <= 0 || current <= 0 {
		return false
	}
	if long {
		return candidate > current
	}
	return candidate < current
}

func intervalElapsed(last, now time.Time, seconds int) bool {
	return last.IsZero() || now.Sub(last) >= time.Duration(seconds)*time.Second
}

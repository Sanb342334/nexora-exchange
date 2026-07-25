package risk

import (
	"math"

	"bybit-scanner/internal/analyzer"
)

type stopResult struct {
	SL, TP   float64
	SLMethod string
}

func computeStops(cfg Config, side Side, entry float64, sig analyzer.Signal, candles []analyzer.Candle) stopResult {
	setup := cfg.stopsForSetup(sig.SetupType)
	atrPct := sig.ATRPct
	if atrPct <= 0 {
		atrPct = 2.0
	}

	atrDist := entry * (atrPct / 100) * setup.SLATRMult
	tpDist := entry * (atrPct / 100) * setup.TPATRMult

	var slATR, tpATR float64
	if side == SideLong {
		slATR = entry - atrDist
		tpATR = entry + tpDist
	} else {
		slATR = entry + atrDist
		tpATR = entry - tpDist
	}

	slStruct, _ := structureStop(cfg, side, entry, candles)

	sl, slMethod := pickSL(cfg.Stops.Method, side, slATR, slStruct)
	tp := tpATR
	tpMethod := "ATR"

	slDist := math.Abs(entry - sl)
	tpDistActual := math.Abs(tp - entry)
	minRR := setup.MinRR
	if minRR <= 0 {
		minRR = cfg.Stops.MinRR
	}

	if slDist > 0 {
		rr := tpDistActual / slDist
		if rr < minRR {
			if side == SideLong {
				tp = entry + slDist*minRR
			} else {
				tp = entry - slDist*minRR
			}
			tpMethod = "RR_FLOOR"
		}
	}

	maxTPDist := entry * (atrPct / 100) * cfg.Stops.MaxTPATRMult
	if maxTPDist > 0 && math.Abs(tp-entry) > maxTPDist {
		if side == SideLong {
			tp = entry + maxTPDist
		} else {
			tp = entry - maxTPDist
		}
	}

	return stopResult{SL: sl, TP: tp, SLMethod: slMethod + "+" + tpMethod}
}

func structureStop(cfg Config, side Side, entry float64, candles []analyzer.Candle) (float64, bool) {
	if len(candles) == 0 {
		return 0, false
	}
	n := cfg.Stops.StructureLookback
	if n > len(candles) {
		n = len(candles)
	}
	buf := cfg.Stops.StructureBufferPct / 100

	var swingLow, swingHigh float64
	for i := len(candles) - n; i < len(candles); i++ {
		c := candles[i]
		if swingLow == 0 || c.Low < swingLow {
			swingLow = c.Low
		}
		if c.High > swingHigh {
			swingHigh = c.High
		}
	}
	if swingLow <= 0 || swingHigh <= 0 {
		return 0, false
	}

	if side == SideLong {
		return swingLow * (1 - buf), true
	}
	return swingHigh * (1 + buf), true
}

func pickSL(method string, side Side, slATR, slStruct float64) (float64, string) {
	hasStruct := slStruct > 0
	switch method {
	case "atr":
		return slATR, "ATR"
	case "structure":
		if hasStruct {
			return slStruct, "STRUCTURE"
		}
		return slATR, "ATR"
	default: // blended
		if !hasStruct {
			return slATR, "ATR"
		}
		if side == SideLong {
			if slStruct < slATR {
				return slStruct, "BLENDED"
			}
			return slATR, "BLENDED"
		}
		if slStruct > slATR {
			return slStruct, "BLENDED"
		}
		return slATR, "BLENDED"
	}
}

func rrRatio(entry, sl, tp float64) float64 {
	slDist := math.Abs(entry - sl)
	if slDist <= 0 {
		return 0
	}
	return math.Abs(tp-entry) / slDist
}

func slDistancePct(entry, sl float64) float64 {
	if entry <= 0 {
		return 0
	}
	return math.Abs(entry-sl) / entry * 100
}

func tpDistancePct(entry, tp float64) float64 {
	if entry <= 0 {
		return 0
	}
	return math.Abs(tp-entry) / entry * 100
}

func resolveSide(sig analyzer.Signal) Side {
	switch sig.TradeAction {
	case "LONG":
		return SideLong
	case "SHORT":
		return SideShort
	}
	switch sig.SetupType {
	case "SHORT_SQUEEZE", "FADE_LONG", "OVERLEVERAGED_SHORTS":
		return SideLong
	case "LONG_LIQUIDATION", "FADE_SHORT", "OVERLEVERAGED_LONGS":
		return SideShort
	}
	if sig.Movement == "PUMP" {
		return SideLong
	}
	return SideShort
}

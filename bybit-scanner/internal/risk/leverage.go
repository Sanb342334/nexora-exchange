package risk

import "math"

func recommendLeverage(cfg Config, setup string, atrPct, entry, sl float64) (int, string) {
	base := cfg.leverageForSetup(setup)
	reason := setup + " cap"

	levAdj := float64(base)
	if atrPct > 0 {
		levAdj = float64(base) * clamp(cfg.Leverage.ATRRefPct/atrPct, 0.5, 1.0)
	}

	slDistPct := slDistancePct(entry, sl)
	if slDistPct > 0 {
		maxLev := cfg.Leverage.MaxSLToLiqRatio / (slDistPct / 100)
		if maxLev < levAdj {
			levAdj = maxLev
			reason = "liq safety cap"
		}
	}

	lev := int(math.Round(levAdj))
	if lev < cfg.Leverage.Min {
		lev = cfg.Leverage.Min
	}
	if lev > cfg.Leverage.Max {
		lev = cfg.Leverage.Max
		reason = "global max"
	}
	return lev, reason
}

func fillLiquidation(rec *TradeRecommendation) {
	entry := rec.Entry
	lev := rec.Leverage
	if entry <= 0 || lev <= 0 {
		return
	}

	invLev := 1.0 / float64(lev)
	if rec.Side == SideLong {
		rec.LiqPrice = entry * (1 - invLev)
	} else {
		rec.LiqPrice = entry * (1 + invLev)
	}

	rec.LiqDistancePct = math.Abs(rec.LiqPrice-entry) / entry * 100
	rec.SLToLiqBuffer = math.Abs(rec.LiqPrice-rec.StopLoss) / entry * 100
}

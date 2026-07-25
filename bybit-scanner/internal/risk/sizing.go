package risk

import "math"

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func riskBudgetPct(cfg Config, score int, volRatio, atrPct float64) float64 {
	scoreFactor := clamp(float64(score)/100.0, cfg.Account.ScoreFactorMin, 1.0)

	volFactor := 1.0
	if volRatio > 0 {
		volFactor = clamp(cfg.Sizing.VolRefRatio/volRatio, cfg.Sizing.VolFactorMin, 1.0)
	}

	atrFactor := 1.0
	if atrPct > 0 {
		atrFactor = clamp(cfg.Sizing.ATRRefPct/atrPct, cfg.Sizing.ATRFactorMin, 1.0)
	}

	return cfg.Account.AccountRiskPct * scoreFactor * volFactor * atrFactor
}

func sizeFromRisk(entry, sl float64, leverage int, riskUSDT, equity float64, cfg SizingConfig) (qty, notional, margin float64) {
	if entry <= 0 || leverage <= 0 {
		return 0, 0, 0
	}

	slDistPct := math.Abs(entry-sl) / entry * 100
	if slDistPct <= 0 {
		return 0, 0, 0
	}

	qty = riskUSDT / (entry * slDistPct / 100)
	notional = qty * entry
	margin = notional / float64(leverage)

	maxByUSDT := cfg.MaxNotionalUSDT
	maxByPct := equity * cfg.MaxNotionalPct / 100
	if maxByPct > 0 && (maxByUSDT == 0 || maxByPct < maxByUSDT) {
		maxByUSDT = maxByPct
	}
	if maxByUSDT > 0 && notional > maxByUSDT {
		scale := maxByUSDT / notional
		qty *= scale
		notional = maxByUSDT
		margin = notional / float64(leverage)
	}

	maxMargin := equity * cfg.MaxMarginUsagePct / 100
	if maxMargin > 0 && margin > maxMargin {
		scale := maxMargin / margin
		qty *= scale
		notional *= scale
		margin = maxMargin
	}

	return qty, notional, margin
}

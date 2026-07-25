package strategy

import (
	"fmt"
	"math"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
)

type vetoResult struct {
	Blocked bool
	Reasons []string
	Penalty int
}

func runVetoes(sig analyzer.Signal, cfg config.StrategyConfig, forTrade bool) vetoResult {
	var res vetoResult

	if sig.Volume1m < cfg.MinVol1mUSDT {
		res.Blocked = true
		res.Reasons = append(res.Reasons, fmt.Sprintf("vol_1m $%.0f < min $%.0f", sig.Volume1m, cfg.MinVol1mUSDT))
	}

	if sig.SpreadPct > 0 && sig.SpreadPct > 0.35 {
		res.Blocked = true
		res.Reasons = append(res.Reasons, fmt.Sprintf("spread %.3f%% too wide", sig.SpreadPct))
	}

	if !forTrade {
		return res
	}

	if cfg.RequireOrderflowAlign {
		if sig.TradeAction == ActionLong && sig.TradeDelta1m < 0 {
			res.Blocked = true
			res.Reasons = append(res.Reasons, "orderflow против LONG")
		}
		if sig.TradeAction == ActionShort && sig.TradeDelta1m > 0 {
			res.Blocked = true
			res.Reasons = append(res.Reasons, "orderflow против SHORT")
		}
	}

	// PUMP label but negative orderflow without fade setup.
	if sig.AlertType != AlertFade && sig.Movement == "PUMP" && sig.TradeDelta1m < 0 {
		res.Penalty += 15
		res.Reasons = append(res.Reasons, "contradiction: PUMP + sell flow")
	}
	if sig.AlertType != AlertFade && sig.Movement == "DUMP" && sig.TradeDelta1m > 0 {
		res.Penalty += 15
		res.Reasons = append(res.Reasons, "contradiction: DUMP + buy flow")
	}

	if math.Abs(sig.PriceChange1m) < 0.15 && sig.AlertType == AlertConfirmed {
		res.Penalty += 10
		res.Reasons = append(res.Reasons, "price flat on confirm")
	}

	return res
}

package traders

import (
	"fmt"
	"math"
	"strings"

	"bybit-scanner/internal/analyzer"
)

// TapeReading — microstructure confluence from live tape / chart proxies.
type TapeReading struct {
	Points int
	Tags   []string
}

func readTape(sig analyzer.Signal) TapeReading {
	var r TapeReading
	long := sig.TradeAction == "LONG" || (sig.TradeAction == "" && sig.Movement == "PUMP")
	short := sig.TradeAction == "SHORT" || (sig.TradeAction == "" && sig.Movement == "DUMP")
	if sig.AlertType == "FADE" {
		long = sig.TradeAction == "LONG"
		short = sig.TradeAction == "SHORT"
	}
	if !long && !short {
		long = sig.TradeDelta1m >= 0
		short = !long
	}

	// Volume pulse (relaxed for micro-cap alts)
	if sig.VolumeRatio >= 1.25 && sig.VolumeRatio <= 12.0 {
		r.Points++
		r.Tags = append(r.Tags, "vol_pulse")
	}

	// Orderflow — lower threshold for score 35–45 setups
	if long && sig.TradeDelta1m > 120 {
		r.Points++
		r.Tags = append(r.Tags, "tape_buy")
	} else if short && sig.TradeDelta1m < -120 {
		r.Points++
		r.Tags = append(r.Tags, "tape_sell")
	}

	if math.Abs(sig.OIChange3m) >= 0.06 {
		r.Points++
		r.Tags = append(r.Tags, "oi_fuel")
	}

	if sig.ATRPct >= 0.25 && sig.ATRPct <= 6.0 {
		r.Points++
		r.Tags = append(r.Tags, "atr_band")
	} else if sig.ATRPct == 0 && sig.VolumeRatio >= 1.8 {
		r.Points++
		r.Tags = append(r.Tags, "atr_band")
	}

	if sig.BTCDecoupled || math.Abs(sig.BTCChange5m) < 1.0 {
		r.Points++
		r.Tags = append(r.Tags, "btc_ctx")
	}

	if long && sig.FundingRate <= -0.005 {
		r.Points++
		r.Tags = append(r.Tags, "fund_long")
	} else if short && sig.FundingRate >= 0.008 {
		r.Points++
		r.Tags = append(r.Tags, "fund_short")
	}

	if sig.Liquidation1m >= 800 {
		if long && sig.PriceChange1m <= -0.15 {
			r.Points++
			r.Tags = append(r.Tags, "liq_flush")
		} else if short && sig.PriceChange1m >= 0.15 {
			r.Points++
			r.Tags = append(r.Tags, "liq_flush")
		}
	}

	if long && sig.LongShortRatio > 0 && sig.LongShortRatio < 0.95 {
		r.Points++
		r.Tags = append(r.Tags, "ls_long")
	} else if short && sig.LongShortRatio > 1.05 {
		r.Points++
		r.Tags = append(r.Tags, "ls_short")
	}

	absMove := math.Abs(sig.PriceChange1m)
	if absMove >= 0.05 && absMove <= 4.0 {
		r.Points++
		r.Tags = append(r.Tags, "price_micro")
	}

	// FADE-specific: counter-move after impulse
	if sig.AlertType == "FADE" && absMove >= 0.05 {
		r.Points++
		r.Tags = append(r.Tags, "fade_setup")
	}

	return r
}

func hasTapeFlow(r TapeReading) bool {
	for _, t := range r.Tags {
		switch t {
		case "tape_buy", "tape_sell", "vol_pulse", "fade_setup":
			return true
		}
	}
	return false
}

func tapeNeedPoints(p Profile, sig analyzer.Signal) int {
	need := p.MinTapePoints
	if need <= 0 {
		need = 2
	}
	switch sig.AlertType {
	case "FADE":
		if need > 2 {
			need = 2
		}
	case "CONFIRMED", "HOT":
		if need > 2 {
			need = 2
		}
	case "IMPULSE":
		need++
	}
	return need
}

func acceptsTapeSync(p Profile, sig analyzer.Signal) (bool, string) {
	if sig.Score < p.MinScore {
		return false, "score_low"
	}
	if p.MaxScore > 0 && sig.Score > p.MaxScore {
		return false, "score_too_high"
	}
	if sig.Volume1m < p.MinVol1mUSDT {
		return false, "vol_low"
	}
	if p.MinTriggers > 0 && len(sig.Triggers) < p.MinTriggers {
		return false, "triggers_low"
	}
	maxSpread := 0.22
	if p.MaxSpreadPct > 0 {
		maxSpread = p.MaxSpreadPct
	}
	if sig.SpreadPct > maxSpread {
		return false, "spread_wide"
	}
	if sig.AlertType == "" {
		return false, "no_alert"
	}

	need := tapeNeedPoints(p, sig)
	reading := readTape(sig)
	if reading.Points < need {
		return false, fmt.Sprintf("tape_weak (%d/%d)", reading.Points, need)
	}
	if !hasTapeFlow(reading) {
		return false, "no_tape_flow"
	}

	return true, ""
}

func formatTapeStrategyRu() string {
	return "Рентген ленты — агрессивный tape (от 2 confluence)"
}

func formatTapeTags(reading TapeReading) string {
	if len(reading.Tags) == 0 {
		return "—"
	}
	return strings.Join(reading.Tags, ", ")
}

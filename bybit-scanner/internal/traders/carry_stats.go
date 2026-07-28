package traders

import (
	"strconv"
	"strings"
	"time"

	"bybit-scanner/internal/risk"
)

func isCarrySetup(rec risk.TradeRecommendation) bool {
	return rec.Signal.SetupType == "CARRY_ARBITRAGE"
}

func carryNetBps(rec risk.TradeRecommendation) float64 {
	for _, reason := range rec.Signal.Reasons {
		if strings.HasPrefix(reason, "carry_net_bps:") {
			v, err := strconv.ParseFloat(strings.TrimPrefix(reason, "carry_net_bps:"), 64)
			if err == nil {
				return v
			}
		}
	}
	return 0
}

func carryAccruedPnL(rec risk.TradeRecommendation, openedAt time.Time, now time.Time, maxHold time.Duration) float64 {
	netBps := carryNetBps(rec)
	if netBps <= 0 || rec.NotionalUSDT <= 0 {
		return 0
	}
	if maxHold <= 0 {
		maxHold = 8 * time.Hour
	}
	elapsed := now.Sub(openedAt)
	if elapsed < 0 {
		elapsed = 0
	}
	fraction := float64(elapsed) / float64(maxHold)
	if fraction > 1 {
		fraction = 1
	}
	return rec.NotionalUSDT * (netBps / 10_000) * fraction
}

func carryTargetPnL(rec risk.TradeRecommendation) float64 {
	netBps := carryNetBps(rec)
	if netBps <= 0 || rec.NotionalUSDT <= 0 {
		return 0
	}
	return rec.NotionalUSDT * (netBps / 10_000) * 0.85
}

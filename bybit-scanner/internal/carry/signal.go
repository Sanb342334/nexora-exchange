package carry

import (
	"fmt"
	"math"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/signals"
	"bybit-scanner/internal/strategy"
)

const SetupIdentity = "CARRY_ARBITRAGE"

// SignalFromOpportunity builds a carry signal for the perp-short hedge leg.
func SignalFromOpportunity(op Opportunity, volume1m float64, now time.Time) analyzer.Signal {
	score := int(math.Min(100, op.ExpectedNetBps*3))
	if score < 20 {
		score = 20
	}
	entry := op.PerpSellPrice
	if entry <= 0 {
		entry = op.SpotBuyPrice
	}
	slDist := entry * 0.003
	tpDist := entry * math.Max(op.ExpectedNetBps/10_000*2, 0.0015)

	return analyzer.Signal{
		SignalID:    signals.NewID(),
		Symbol:      op.Symbol,
		Timestamp:   now,
		Price:       entry,
		Movement:    "CARRY",
		TradeAction: strategy.ActionShort,
		AlertType:   "CARRY",
		SetupType:   SetupIdentity,
		Score:       score,
		Volume1m:    volume1m,
		SuggestedSL: entry + slDist,
		SuggestedTP: entry - tpDist,
		Triggers:    []analyzer.TriggerType{analyzer.TriggerFundingExt},
		Reasons: []string{
			fmt.Sprintf("carry_net_bps:%.2f", op.ExpectedNetBps),
			fmt.Sprintf("carry_basis_bps:%.2f", op.BasisBps),
			fmt.Sprintf("carry_funding_bps:%.2f", op.ExpectedFundingBps),
			fmt.Sprintf("carry_spot_ask:%.8g", op.SpotBuyPrice),
			fmt.Sprintf("carry_perp_bid:%.8g", op.PerpSellPrice),
			"hedge:spot_long+perp_short",
		},
	}
}

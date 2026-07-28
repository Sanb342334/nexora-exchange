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

// SignalFromOpportunity builds a paper carry signal for the intra-exchange
// spot-long / perp-short hedge model.
func SignalFromOpportunity(op Opportunity, volume1m float64, now time.Time) analyzer.Signal {
	score := int(math.Min(100, op.ExpectedNetBps*2))
	if score < 25 {
		score = 25
	}
	entry := op.SpotBuyPrice
	if entry <= 0 {
		entry = op.PerpSellPrice
	}
	slDist := entry * 0.002
	tpDist := entry * (op.ExpectedNetBps / 10_000 * 1.5)
	if tpDist < entry*0.001 {
		tpDist = entry * 0.001
	}

	return analyzer.Signal{
		SignalID:    signals.NewID(),
		Symbol:      op.Symbol,
		Timestamp:   now,
		Price:       entry,
		Movement:    "CARRY",
		TradeAction: strategy.ActionLong,
		AlertType:   "CARRY",
		SetupType:   SetupIdentity,
		Score:       score,
		Volume1m:    volume1m,
		SuggestedSL: entry - slDist,
		SuggestedTP: entry + tpDist,
		Triggers:    []analyzer.TriggerType{analyzer.TriggerFundingExt},
		Reasons: []string{
			fmt.Sprintf("carry_net_bps:%.2f", op.ExpectedNetBps),
			fmt.Sprintf("carry_basis_bps:%.2f", op.BasisBps),
			fmt.Sprintf("carry_funding_bps:%.2f", op.ExpectedFundingBps),
			"hedge:spot_long+perp_short",
		},
	}
}

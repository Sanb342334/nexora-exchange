// Package carry contains the delta-neutral Spot↔Linear cash-and-carry model.
// It is intentionally independent from directional signal scoring.
package carry

import (
	"math"
	"sync"
	"time"

	"bybit-scanner/internal/config"
)

type Quote struct {
	Bid       float64
	Ask       float64
	Last      float64
	Funding   float64
	UpdatedAt time.Time
}

type Opportunity struct {
	ID                 string
	Symbol             string
	SpotBuyPrice       float64
	PerpSellPrice      float64
	BasisBps           float64
	ExpectedFundingBps float64
	EstimatedCostBps   float64
	ExpectedNetBps     float64
	DetectedAt         time.Time
}

// BasisStore preserves executable (not mid-price) quotes for both legs.
type BasisStore struct {
	mu   sync.RWMutex
	spot map[string]Quote
	perp map[string]Quote
}

func NewBasisStore() *BasisStore {
	return &BasisStore{spot: make(map[string]Quote), perp: make(map[string]Quote)}
}

func (s *BasisStore) UpdateSpot(symbol string, quote Quote) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.spot[symbol] = quote
}

func (s *BasisStore) UpdatePerp(symbol string, quote Quote) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.perp[symbol] = quote
}

func (s *BasisStore) Evaluate(symbol string, cfg config.CarryConfig, now time.Time) (Opportunity, bool) {
	s.mu.RLock()
	spot, spotOK := s.spot[symbol]
	perp, perpOK := s.perp[symbol]
	s.mu.RUnlock()
	if !spotOK || !perpOK || spot.Ask <= 0 || perp.Bid <= 0 {
		return Opportunity{}, false
	}
	maxAge := time.Duration(cfg.MaxUnhedgedSeconds) * time.Second
	if maxAge <= 0 {
		maxAge = 3 * time.Second
	}
	if now.Sub(spot.UpdatedAt) > maxAge || now.Sub(perp.UpdatedAt) > maxAge {
		return Opportunity{}, false
	}
	basisBps := (perp.Bid - spot.Ask) / spot.Ask * 10_000
	// Funding is expressed as a rate, so convert it to basis points for the
	// next funding interval. Short-perp receives positive funding.
	fundingBps := perp.Funding * 10_000
	costBps := 2*(cfg.FeeBpsPerLeg+cfg.SlippageBpsPerLeg) + cfg.FundingUncertaintyBps
	net := basisBps + fundingBps - costBps
	if math.IsNaN(net) || math.IsInf(net, 0) || net < cfg.MinNetCarryBps {
		return Opportunity{}, false
	}
	return Opportunity{
		ID:                 symbol + "-" + now.UTC().Format("20060102150405"),
		Symbol:             symbol,
		SpotBuyPrice:       spot.Ask,
		PerpSellPrice:      perp.Bid,
		BasisBps:           basisBps,
		ExpectedFundingBps: fundingBps,
		EstimatedCostBps:   costBps,
		ExpectedNetBps:     net,
		DetectedAt:         now.UTC(),
	}, true
}

// NetPnL attributes both legs and all known costs; it must be used instead of
// reporting the profitable leg alone.
func NetPnL(spotEntry, spotExit, perpEntry, perpExit, quantity, fees, funding float64) float64 {
	spotPnL := (spotExit - spotEntry) * quantity
	perpPnL := (perpEntry - perpExit) * quantity // short linear perp
	return spotPnL + perpPnL + funding - fees
}

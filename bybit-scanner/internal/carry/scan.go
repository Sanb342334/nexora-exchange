package carry

import (
	"time"

	"bybit-scanner/internal/config"
)

// ScanOpportunities evaluates every symbol after a spot refresh cycle.
func ScanOpportunities(basis *BasisStore, symbols []string, cfg config.CarryConfig, now time.Time) []Opportunity {
	if basis == nil || !cfg.PaperEnabled {
		return nil
	}
	out := make([]Opportunity, 0, 4)
	for _, symbol := range symbols {
		op, ok := basis.Evaluate(symbol, cfg, now)
		if !ok {
			continue
		}
		out = append(out, op)
	}
	return out
}

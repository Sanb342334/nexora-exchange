package market

import (
	"context"
	"time"

	"bybit-scanner/internal/carry"
	"bybit-scanner/internal/logger"
)

// SpotPoller is the read-only source for paper cash-and-carry. One all-ticker
// request is used per interval rather than one request per symbol.
type SpotPoller struct {
	rest     *RESTClient
	store    *carry.BasisStore
	log      *logger.Loggers
	symbols  []string
	interval time.Duration
}

func NewSpotPoller(rest *RESTClient, store *carry.BasisStore, log *logger.Loggers, symbols []string) *SpotPoller {
	return &SpotPoller{
		rest: rest, store: store, log: log, symbols: append([]string(nil), symbols...),
		interval: 2 * time.Second,
	}
}

func (p *SpotPoller) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(p.interval)
		defer ticker.Stop()
		p.poll(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				p.poll(ctx)
			}
		}
	}()
}

func (p *SpotPoller) poll(ctx context.Context) {
	requestCtx, cancel := context.WithTimeout(ctx, time.Second)
	quotes, err := p.rest.FetchSpotQuotes(requestCtx, p.symbols)
	cancel()
	if err != nil {
		p.log.Errors.Warn().Err(err).Msg("spot quote poll failed")
		return
	}
	for symbol, quote := range quotes {
		p.store.UpdateSpot(symbol, carry.Quote{
			Bid: quote.Bid, Ask: quote.Ask, Last: quote.Last, UpdatedAt: quote.UpdatedAt,
		})
	}
}

package market

import (
	"context"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/logger"
)

type OIPoller struct {
	rest    *RESTClient
	store   *analyzer.Store
	cfg     *config.Config
	log     *logger.Loggers
	symbols []string
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	sem     chan struct{}
}

func NewOIPoller(rest *RESTClient, store *analyzer.Store, cfg *config.Config, log *logger.Loggers, symbols []string) *OIPoller {
	return &OIPoller{
		rest:    rest,
		store:   store,
		cfg:     cfg,
		log:     log,
		symbols: symbols,
		sem:     make(chan struct{}, 8),
	}
}

func (p *OIPoller) Start(ctx context.Context) {
	ctx, p.cancel = context.WithCancel(ctx)
	p.wg.Add(1)
	go p.loop(ctx)
	p.log.Scanner.Info().
		Dur("interval", p.cfg.OIPollInterval).
		Int("symbols", len(p.symbols)).
		Msg("OI poller started")
}

func (p *OIPoller) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	p.wg.Wait()
}

func (p *OIPoller) loop(ctx context.Context) {
	defer p.wg.Done()

	ticker := time.NewTicker(p.cfg.OIPollInterval)
	defer ticker.Stop()

	p.pollAll(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.pollAll(ctx)
		}
	}
}

func (p *OIPoller) pollAll(ctx context.Context) {
	var wg sync.WaitGroup
	for _, symbol := range p.symbols {
		sym := symbol
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case p.sem <- struct{}{}:
				defer func() { <-p.sem }()
			case <-ctx.Done():
				return
			}

			oi, ts, err := p.rest.FetchOpenInterest(ctx, sym)
			if err != nil {
				p.log.Errors.Debug().Str("symbol", sym).Err(err).Msg("oi poll failed")
				return
			}
			if ts.IsZero() {
				ts = time.Now().UTC()
			}
			st := p.store.Ensure(sym)
			st.UpdateOI(oi, ts)
		}()
	}
	wg.Wait()
}

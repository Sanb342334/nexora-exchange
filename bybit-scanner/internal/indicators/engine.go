// Package indicators implements the 5-indicator MTF (5m/15m) volume strategy.
package indicators

import (
	"fmt"
	"math"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/signals"
	"bybit-scanner/internal/strategy"
)

const (
	DetectorIdentity = "indicator_mtf_5"
	SetupIdentity    = "MTF_INDICATOR_5"
)

type Decision struct {
	Symbol   string
	Signal   *analyzer.Signal
	SignalID string
	Reasons  []string
	Votes5m  []Vote
	Votes15m []Vote
}

type candleStore struct {
	mu     sync.Mutex
	rings  map[string]map[string][]analyzer.Candle
	maxBar int
}

func newCandleStore(maxBars int) *candleStore {
	if maxBars <= 0 {
		maxBars = 120
	}
	return &candleStore{rings: make(map[string]map[string][]analyzer.Candle), maxBar: maxBars}
}

func (s *candleStore) Update(symbol, interval string, candle analyzer.Candle) {
	if !candle.Confirmed || candle.Start.IsZero() || candle.Close <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	byInterval, ok := s.rings[symbol]
	if !ok {
		byInterval = make(map[string][]analyzer.Candle)
		s.rings[symbol] = byInterval
	}
	ring := byInterval[interval]
	for i := range ring {
		if ring[i].Start.Equal(candle.Start) {
			ring[i] = candle
			byInterval[interval] = ring
			return
		}
	}
	ring = append(ring, candle)
	if len(ring) > s.maxBar {
		ring = append([]analyzer.Candle(nil), ring[len(ring)-s.maxBar:]...)
	}
	byInterval[interval] = ring
}

func (s *candleStore) Candles(symbol, interval string) []analyzer.Candle {
	s.mu.Lock()
	defer s.mu.Unlock()
	byInterval := s.rings[symbol]
	if byInterval == nil {
		return nil
	}
	ring := byInterval[interval]
	out := make([]analyzer.Candle, len(ring))
	copy(out, ring)
	return out
}

type Engine struct {
	cfg      *config.Config
	store    *candleStore
	mu       sync.Mutex
	lastSeen map[string]time.Time
}

func NewEngine(cfg *config.Config) *Engine {
	return &Engine{
		cfg:      cfg,
		store:    newCandleStore(120),
		lastSeen: make(map[string]time.Time),
	}
}

func (e *Engine) Enabled() bool {
	return e.cfg.Snapshot().IndicatorMTF.Enabled
}

func (e *Engine) UpdateKline(symbol, interval string, candle analyzer.Candle) {
	e.store.Update(symbol, interval, candle)
}

func (e *Engine) Evaluate(symbol string, st *analyzer.SymbolState, now time.Time) *Decision {
	cfg := e.cfg.Snapshot().IndicatorMTF
	if !cfg.Enabled {
		return nil
	}
	candles5 := e.store.Candles(symbol, "5")
	candles15 := e.store.Candles(symbol, "15")
	minBars := cfg.MinBars
	if minBars <= 0 {
		minBars = 30
	}
	if len(candles5) < minBars || len(candles15) < minBars/3 {
		return nil
	}
	last5 := candles5[len(candles5)-1]
	if cfg.MinVolumeUSDT5m > 0 && last5.VolumeUSDT < cfg.MinVolumeUSDT5m {
		return nil
	}

	votes5 := fiveVotes(candles5, cfg.RSIPeriod)
	votes15 := fiveVotes(candles15, cfg.RSIPeriod)
	sum5 := sumVotes(votes5)
	sum15 := sumVotes(votes15)

	minVotes := cfg.MinIndicatorVotes
	if minVotes <= 0 {
		minVotes = 4
	}
	minConfirm := cfg.MinConfirm15m
	if minConfirm <= 0 {
		minConfirm = 3
	}

	direction := ""
	switch {
	case sum5 >= minVotes && sum15 >= minConfirm:
		direction = strategy.ActionLong
	case sum5 <= -minVotes && sum15 <= -minConfirm:
		direction = strategy.ActionShort
	default:
		return nil
	}

	key := symbol + ":" + direction
	cooldown := time.Duration(cfg.CooldownSec) * time.Second
	if cooldown <= 0 {
		cooldown = 2 * time.Minute
	}
	e.mu.Lock()
	if last := e.lastSeen[key]; !last.IsZero() && now.Sub(last) < cooldown {
		e.mu.Unlock()
		return nil
	}
	e.lastSeen[key] = now
	e.mu.Unlock()

	s := st.SnapshotQuality(symbol, now)
	if s.SpreadPct <= 0 || s.SpreadPct > cfg.MaxSpreadPct {
		return nil
	}
	price := s.Price
	if price <= 0 {
		price = last5.Close
	}

	signalID := signals.NewID()
	absSum := math.Abs(float64(sum5)) + math.Abs(float64(sum15))
	score := int(math.Min(100, 50+absSum*5))
	movement := "PUMP"
	if direction == strategy.ActionShort {
		movement = "DUMP"
	}

	reasons := []string{
		fmt.Sprintf("mtf:5m_votes=%+d", sum5),
		fmt.Sprintf("mtf:15m_votes=%+d", sum15),
	}
	for _, v := range votes5 {
		reasons = append(reasons, fmt.Sprintf("5m:%s=%+.0f", v.Name, v.Value))
	}

	sig := &analyzer.Signal{
		Symbol: symbol, SignalID: signalID, Timestamp: now, Price: price,
		Movement: movement, TradeAction: direction, AlertType: "INDICATOR_MTF",
		SetupType: SetupIdentity, Score: score,
		Triggers:      []analyzer.TriggerType{analyzer.TriggerVolumeSpike, analyzer.TriggerPriceVol},
		Volume1m:      s.NormalizedVolumeUSDT,
		VolumeRatio:   volumeRatio(candles5, 20),
		SpreadPct:     s.SpreadPct,
		PriceChange1m: (last5.Close - last5.Open) / last5.Open * 100,
		Reasons:       reasons,
	}

	return &Decision{
		Symbol: symbol, Signal: sig, SignalID: signalID,
		Reasons: reasons, Votes5m: votes5, Votes15m: votes15,
	}
}

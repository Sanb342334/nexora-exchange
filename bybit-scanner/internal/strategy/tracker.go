package strategy

import (
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
)

type impulseTrack struct {
	Symbol      string
	StartedAt   time.Time
	ImpulseDir  string // PUMP or DUMP
	StartPrice  float64
	PeakPrice   float64
	TroughPrice float64
	Base        analyzer.Signal
	ImpulseSent bool
}

type trackerStore struct {
	mu      sync.Mutex
	active  map[string]*impulseTrack
	cooldown map[string]time.Time
}

func newTrackerStore() *trackerStore {
	return &trackerStore{
		active:   make(map[string]*impulseTrack),
		cooldown: make(map[string]time.Time),
	}
}

func (s *trackerStore) get(symbol string) (*impulseTrack, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.active[symbol]
	return t, ok
}

func (s *trackerStore) start(t *impulseTrack) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.active[t.Symbol] = t
}

func (s *trackerStore) remove(symbol string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.active, symbol)
}

func (s *trackerStore) onCooldown(symbol string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.cooldown[symbol]
	return ok && now.Before(until)
}

func (s *trackerStore) setCooldown(symbol string, until time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cooldown[symbol] = until
}

func (t *impulseTrack) updatePrice(price float64) {
	if price <= 0 {
		return
	}
	if t.PeakPrice == 0 || price > t.PeakPrice {
		t.PeakPrice = price
	}
	if t.TroughPrice == 0 || price < t.TroughPrice {
		t.TroughPrice = price
	}
}

func (t *impulseTrack) retrace(price float64) float64 {
	if price <= 0 {
		return 0
	}
	if t.ImpulseDir == "PUMP" {
		denom := t.PeakPrice - t.StartPrice
		if denom <= 0 {
			denom = t.PeakPrice * 0.003
		}
		if price >= t.PeakPrice {
			return 0
		}
		return (t.PeakPrice - price) / denom * 100
	}
	// DUMP: measure bounce from trough relative to drop range
	trough := t.TroughPrice
	if trough <= 0 || t.StartPrice <= trough {
		return 0
	}
	denom := t.StartPrice - trough
	if price <= trough {
		return 0
	}
	return (price - trough) / denom * 100
}

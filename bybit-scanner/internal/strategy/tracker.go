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
	mu       sync.Mutex
	active   map[string]map[string]*impulseTrack
	cooldown map[string]time.Time
}

func newTrackerStore() *trackerStore {
	return &trackerStore{
		active:   make(map[string]map[string]*impulseTrack),
		cooldown: make(map[string]time.Time),
	}
}

func (s *trackerStore) getAll(symbol string) []*impulseTrack {
	s.mu.Lock()
	defer s.mu.Unlock()
	group := s.active[symbol]
	out := make([]*impulseTrack, 0, len(group))
	for _, track := range group {
		out = append(out, track)
	}
	return out
}

func (s *trackerStore) hasDirection(symbol, direction string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, track := range s.active[symbol] {
		if track.ImpulseDir == direction {
			return true
		}
	}
	return false
}

func (s *trackerStore) start(t *impulseTrack) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active[t.Symbol] == nil {
		s.active[t.Symbol] = make(map[string]*impulseTrack)
	}
	s.active[t.Symbol][trackKey(t)] = t
}

func (s *trackerStore) remove(t *impulseTrack) {
	s.mu.Lock()
	defer s.mu.Unlock()
	group := s.active[t.Symbol]
	delete(group, trackKey(t))
	if len(group) == 0 {
		delete(s.active, t.Symbol)
	}
}

func (s *trackerStore) onCooldown(symbol string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.cooldown[symbol]
	return ok && now.Before(until)
}

func trackKey(t *impulseTrack) string {
	return t.Symbol + ":" + t.ImpulseDir + ":" + t.Base.SetupType
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

package traders

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"bybit-scanner/internal/risk"
)

type Stats struct {
	mu sync.Mutex

	ProfileID   string    `json:"profile_id"`
	TradesTaken int       `json:"trades_taken"`
	TradesSkip  int       `json:"trades_skipped"`
	Wins        int       `json:"wins"`
	Losses      int       `json:"losses"`
	Open        int       `json:"open"`
	TotalPnL    float64   `json:"total_pnl_usdt"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type openTrade struct {
	ID         string
	Symbol     string
	Side       risk.Side
	Entry      float64
	SL         float64
	TP         float64
	RiskUSDT   float64
	OpenedAt   time.Time
}

type StatsStore struct {
	mu        sync.Mutex
	dir       string
	profileID string
	stats     Stats
	open      map[string]openTrade // id -> trade
}

func NewStatsStore(logDir, profileID string) *StatsStore {
	dir := filepath.Join(logDir, "traders", profileID)
	_ = os.MkdirAll(dir, 0o755)
	s := &StatsStore{
		dir:       dir,
		profileID: profileID,
		open:      make(map[string]openTrade),
		stats: Stats{
			ProfileID: profileID,
			UpdatedAt: time.Now().UTC(),
		},
	}
	s.load()
	return s
}

func (s *StatsStore) RecordSkipReason(reason string) {
	s.mu.Lock()
	s.stats.TradesSkip++
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	s.save()
	_ = reason
}

func (s *StatsStore) RecordOpen(rec risk.TradeRecommendation) {
	id := rec.Signal.Timestamp.Format("20060102150405") + "-" + rec.Signal.Symbol
	s.mu.Lock()
	s.stats.TradesTaken++
	s.stats.Open++
	s.open[id] = openTrade{
		ID: id, Symbol: rec.Signal.Symbol, Side: rec.Side,
		Entry: rec.Entry, SL: rec.StopLoss, TP: rec.TakeProfit,
		RiskUSDT: rec.RiskUSDT, OpenedAt: rec.Timestamp,
	}
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	s.save()
}

// RecordExchangeClose records PnL confirmed by Bybit, not synthetic price
// touches. It is used whenever demo autotrading is enabled.
func (s *StatsStore) RecordExchangeClose(pnl float64) {
	s.mu.Lock()
	if s.stats.Open > 0 {
		s.stats.Open--
	}
	s.stats.TotalPnL += pnl
	if pnl > 0 {
		s.stats.Wins++
	} else if pnl < 0 {
		s.stats.Losses++
	}
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	s.save()
}

func (s *StatsStore) CheckPrice(symbol string, price float64) {
	if price <= 0 {
		return
	}
	var closed []openTrade
	s.mu.Lock()
	for id, t := range s.open {
		if t.Symbol != symbol {
			continue
		}
		hit, pnl := checkHit(t, price)
		if !hit {
			continue
		}
		delete(s.open, id)
		s.stats.Open--
		s.stats.TotalPnL += pnl
		if pnl >= 0 {
			s.stats.Wins++
		} else {
			s.stats.Losses++
		}
		closed = append(closed, t)
	}
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	if len(closed) > 0 {
		s.save()
	}
}

func checkHit(t openTrade, price float64) (bool, float64) {
	if t.Side == risk.SideLong {
		if price <= t.SL {
			return true, -t.RiskUSDT
		}
		if price >= t.TP {
			rr := t.RiskUSDT * estimateRR(t.Entry, t.SL, t.TP)
			return true, rr
		}
	}
	if price >= t.SL {
		return true, -t.RiskUSDT
	}
	if price <= t.TP {
		return true, t.RiskUSDT * estimateRR(t.Entry, t.SL, t.TP)
	}
	return false, 0
}

func estimateRR(entry, sl, tp float64) float64 {
	slDist := abs(entry - sl)
	if slDist <= 0 {
		return 1.5
	}
	return abs(tp-entry) / slDist
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func (s *StatsStore) Snapshot() Stats {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stats
}

func (s *StatsStore) WinRate() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	total := s.stats.Wins + s.stats.Losses
	if total == 0 {
		return 0
	}
	return float64(s.stats.Wins) / float64(total) * 100
}

func (s *StatsStore) load() {
	path := filepath.Join(s.dir, "stats.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &s.stats)
}

func (s *StatsStore) save() {
	s.mu.Lock()
	data, err := json.MarshalIndent(s.stats, "", "  ")
	s.mu.Unlock()
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(s.dir, "stats.json"), data, 0o644)
}

func (s Stats) Closed() int {
	return s.Wins + s.Losses
}

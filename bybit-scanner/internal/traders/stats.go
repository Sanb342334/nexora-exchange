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
	ProfileID   string    `json:"profile_id"`
	TradesTaken int       `json:"trades_taken"`
	TradesSkip  int       `json:"trades_skipped"`
	Wins        int       `json:"wins"`
	Losses      int       `json:"losses"`
	Open        int       `json:"open"`
	TotalPnL    float64   `json:"total_pnl_usdt"`
	GrossProfit float64   `json:"gross_profit_usdt"`
	GrossLoss   float64   `json:"gross_loss_usdt"`
	MaxDrawdown float64   `json:"max_drawdown_usdt"`
	PeakPnL     float64   `json:"peak_pnl_usdt"`
	AverageR    float64   `json:"average_r"`
	TotalR      float64   `json:"total_r"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type openTrade struct {
	ID             string
	Symbol         string
	Side           risk.Side
	Entry          float64
	MarkPrice      float64
	SL             float64
	TP             float64
	RiskUSDT       float64
	OpenedAt       time.Time
	Recommendation risk.TradeRecommendation
}

// ClosedVirtualTrade is emitted in paper mode so the manager can close its
// risk state and append a complete journal event alongside the stats update.
type ClosedVirtualTrade struct {
	Recommendation risk.TradeRecommendation
	PnL            float64
	CloseReason    string
	ClosedAt       time.Time
}

// OpenPosition is a live virtual allocation. UnrealisedPnL is mark-to-market
// only; realised demo PnL is still taken solely from Bybit reconciliation.
type OpenPosition struct {
	ID            string
	Symbol        string
	Side          risk.Side
	Entry         float64
	MarkPrice     float64
	UnrealizedPnL float64
	OpenedAt      time.Time
	OrderID       string
}

type StatsStore struct {
	mu        sync.Mutex
	dir       string
	profileID string
	stats     Stats
	open      map[string]openTrade // id -> trade
}

type persistedStatsState struct {
	Stats Stats                `json:"stats"`
	Open  map[string]openTrade `json:"open"`
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
	id := rec.Signal.SignalID
	if id == "" {
		id = rec.Signal.Timestamp.Format("20060102150405") + "-" + rec.Signal.Symbol
	}
	s.mu.Lock()
	if _, exists := s.open[id]; !exists {
		s.stats.TradesTaken++
	}
	s.open[id] = openTrade{
		ID: id, Symbol: rec.Signal.Symbol, Side: rec.Side,
		Entry: rec.Entry, MarkPrice: rec.Entry, SL: rec.StopLoss, TP: rec.TakeProfit,
		RiskUSDT: rec.RiskUSDT, OpenedAt: rec.Timestamp,
		Recommendation: rec,
	}
	s.stats.Open = len(s.open)
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	s.save()
}

// UpdateMark refreshes mark-to-market prices without changing any realised
// statistic or closing a demo position locally.
func (s *StatsStore) UpdateMark(symbol string, price float64) {
	if price <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, trade := range s.open {
		if trade.Symbol != symbol {
			continue
		}
		if isCarrySetup(trade.Recommendation) {
			continue
		}
		trade.MarkPrice = price
		s.open[id] = trade
	}
}

func (s *StatsStore) OpenPositions() []OpenPosition {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]OpenPosition, 0, len(s.open))
	for _, trade := range s.open {
		mark := trade.MarkPrice
		if mark <= 0 {
			mark = trade.Entry
		}
		pnl := (mark - trade.Entry) * trade.Recommendation.Qty
		if trade.Side == risk.SideShort {
			pnl = -pnl
		}
		if isCarrySetup(trade.Recommendation) {
			pnl = carryAccruedPnL(trade.Recommendation, trade.OpenedAt, time.Now().UTC(), 8*time.Hour)
		}
		out = append(out, OpenPosition{
			ID: trade.ID, Symbol: trade.Symbol, Side: trade.Side, Entry: trade.Entry,
			MarkPrice: mark, UnrealizedPnL: pnl, OpenedAt: trade.OpenedAt,
		})
	}
	return out
}

// RecordExchangeClose records PnL confirmed by Bybit, not synthetic price
// touches. It is used whenever demo autotrading is enabled.
func (s *StatsStore) RecordExchangeClose(pnl float64) {
	s.recordExchangeClose("", pnl, 0)
}

// RecordExchangeCloseFor removes the persisted open position that belongs to
// the recommendation before updating realised demo PnL. This makes a restart
// safe: a reconciled order cannot reappear as open.
func (s *StatsStore) RecordExchangeCloseFor(rec risk.TradeRecommendation, pnl float64) {
	id := rec.Signal.SignalID
	if id == "" {
		id = rec.Signal.Timestamp.Format("20060102150405") + "-" + rec.Signal.Symbol
	}
	s.recordExchangeClose(id, pnl, rec.RiskUSDT)
}

func (s *StatsStore) recordExchangeClose(id string, pnl, riskUSDT float64) {
	s.mu.Lock()
	if id != "" {
		delete(s.open, id)
	}
	s.stats.Open = len(s.open)
	if id == "" && s.stats.Open > 0 {
		s.stats.Open--
	}
	s.stats.TotalPnL += pnl
	if pnl > 0 {
		s.stats.Wins++
		s.stats.GrossProfit += pnl
	} else if pnl < 0 {
		s.stats.Losses++
		s.stats.GrossLoss += -pnl
	}
	s.updateRiskMetricsLocked(pnl, riskUSDT)
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	s.save()
}

func (s *StatsStore) CheckPrice(symbol string, price float64) []ClosedVirtualTrade {
	if price <= 0 {
		return nil
	}
	var closed []ClosedVirtualTrade
	s.mu.Lock()
	for id, t := range s.open {
		if t.Symbol != symbol {
			continue
		}
		hit, pnl, reason := checkHit(t, price)
		if !hit {
			continue
		}
		delete(s.open, id)
		s.stats.Open--
		s.stats.TotalPnL += pnl
		if pnl >= 0 {
			s.stats.Wins++
			s.stats.GrossProfit += pnl
		} else {
			s.stats.Losses++
			s.stats.GrossLoss += -pnl
		}
		s.updateRiskMetricsLocked(pnl, t.RiskUSDT)
		closed = append(closed, ClosedVirtualTrade{
			Recommendation: t.Recommendation,
			PnL:            pnl,
			CloseReason:    reason,
			ClosedAt:       time.Now().UTC(),
		})
	}
	s.stats.UpdatedAt = time.Now().UTC()
	s.mu.Unlock()
	if len(closed) > 0 {
		s.save()
	}
	return closed
}

// CheckCarryMaturity closes delta-neutral carry allocations by accrued basis/funding PnL.
func (s *StatsStore) CheckCarryMaturity(now time.Time, maxHold time.Duration) []ClosedVirtualTrade {
	if maxHold <= 0 {
		maxHold = 8 * time.Hour
	}
	var closed []ClosedVirtualTrade
	s.mu.Lock()
	for id, t := range s.open {
		if !isCarrySetup(t.Recommendation) {
			continue
		}
		elapsed := now.Sub(t.OpenedAt)
		pnl := carryAccruedPnL(t.Recommendation, t.OpenedAt, now, maxHold)
		target := carryTargetPnL(t.Recommendation)
		reason := ""
		switch {
		case elapsed >= maxHold:
			reason = "carry_max_hold"
		case target > 0 && pnl >= target:
			reason = "carry_target_reached"
		default:
			continue
		}
		delete(s.open, id)
		s.stats.Open--
		s.stats.TotalPnL += pnl
		if pnl >= 0 {
			s.stats.Wins++
			s.stats.GrossProfit += pnl
		} else {
			s.stats.Losses++
			s.stats.GrossLoss += -pnl
		}
		s.updateRiskMetricsLocked(pnl, t.RiskUSDT)
		closed = append(closed, ClosedVirtualTrade{
			Recommendation: t.Recommendation,
			PnL:            pnl,
			CloseReason:    reason,
			ClosedAt:       now,
		})
	}
	s.stats.UpdatedAt = now
	s.mu.Unlock()
	if len(closed) > 0 {
		s.save()
	}
	return closed
}

func checkHit(t openTrade, price float64) (bool, float64, string) {
	if isCarrySetup(t.Recommendation) {
		return false, 0, ""
	}
	if t.Side == risk.SideLong {
		if price <= t.SL {
			return true, -t.RiskUSDT, "paper_stop_loss"
		}
		if price >= t.TP {
			rr := t.RiskUSDT * estimateRR(t.Entry, t.SL, t.TP)
			return true, rr, "paper_take_profit"
		}
	}
	if price >= t.SL {
		return true, -t.RiskUSDT, "paper_stop_loss"
	}
	if price <= t.TP {
		return true, t.RiskUSDT * estimateRR(t.Entry, t.SL, t.TP), "paper_take_profit"
	}
	return false, 0, ""
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
	path := filepath.Join(s.dir, "state.json")
	data, err := os.ReadFile(path)
	if err != nil {
		// Compatibility with the pre-state format.
		legacy, legacyErr := os.ReadFile(filepath.Join(s.dir, "stats.json"))
		if legacyErr == nil {
			_ = json.Unmarshal(legacy, &s.stats)
		}
		return
	}
	var state persistedStatsState
	if json.Unmarshal(data, &state) == nil {
		s.stats = state.Stats
		if state.Open != nil {
			s.open = state.Open
			s.stats.Open = len(state.Open)
		}
	}
}

func (s *StatsStore) save() {
	s.mu.Lock()
	state := persistedStatsState{Stats: s.stats, Open: s.open}
	data, err := json.MarshalIndent(state, "", "  ")
	s.mu.Unlock()
	if err != nil {
		return
	}
	if err := writeAtomic(filepath.Join(s.dir, "state.json"), data); err != nil {
		return
	}
	// Keep the public lightweight dashboard file backwards-compatible.
	snapshot, err := json.MarshalIndent(state.Stats, "", "  ")
	if err == nil {
		_ = writeAtomic(filepath.Join(s.dir, "stats.json"), snapshot)
	}
}

func (s Stats) Closed() int {
	return s.Wins + s.Losses
}

func (s Stats) ProfitFactor() float64 {
	if s.GrossLoss == 0 {
		if s.GrossProfit > 0 {
			return s.GrossProfit
		}
		return 0
	}
	return s.GrossProfit / s.GrossLoss
}

func (s *StatsStore) updateRiskMetricsLocked(pnl, riskUSDT float64) {
	if riskUSDT > 0 {
		s.stats.TotalR += pnl / riskUSDT
		closed := s.stats.Wins + s.stats.Losses
		if closed > 0 {
			s.stats.AverageR = s.stats.TotalR / float64(closed)
		}
	}
	if s.stats.TotalPnL > s.stats.PeakPnL {
		s.stats.PeakPnL = s.stats.TotalPnL
	}
	drawdown := s.stats.PeakPnL - s.stats.TotalPnL
	if drawdown > s.stats.MaxDrawdown {
		s.stats.MaxDrawdown = drawdown
	}
}

func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

package risk

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type openPosition struct {
	Symbol   string  `json:"symbol"`
	Side     Side    `json:"side"`
	Bucket   string  `json:"bucket"`
	Notional float64 `json:"notional"`
	OpenedAt time.Time `json:"opened_at"`
}

type modeState struct {
	Date               string         `json:"date"`
	DailyPnLUSDT       float64        `json:"daily_pnl_usdt"`
	ConsecutiveLosses  int            `json:"consecutive_losses"`
	LossCooldownUntil  *time.Time     `json:"loss_cooldown_until,omitempty"`
	OpenPositions      []openPosition `json:"open_positions"`
	KillSwitch         bool           `json:"kill_switch"`
}

type persistedState struct {
	Demo modeState `json:"demo"`
	Live modeState `json:"live"`
}

type StateStore struct {
	mu   sync.Mutex
	path string
	data persistedState
}

func NewStateStore(path string) *StateStore {
	s := &StateStore{path: path}
	s.load()
	return s
}

func (s *StateStore) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		s.resetDayIfNeeded()
		return
	}
	if err := json.Unmarshal(data, &s.data); err != nil {
		s.resetDayIfNeeded()
		return
	}
	s.resetDayIfNeeded()
}

func (s *StateStore) save() {
	dir := filepath.Dir(s.path)
	_ = os.MkdirAll(dir, 0o755)
	data, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.path, data, 0o644)
}

func (s *StateStore) resetDayIfNeeded() {
	today := time.Now().UTC().Format("2006-01-02")
	s.ensureMode(&s.data.Demo, today)
	s.ensureMode(&s.data.Live, today)
}

func (s *StateStore) ensureMode(m *modeState, today string) {
	if m.Date != today {
		m.Date = today
		m.DailyPnLUSDT = 0
		m.ConsecutiveLosses = 0
		m.LossCooldownUntil = nil
	}
}

func (s *StateStore) modeState(mode TradingMode) *modeState {
	if mode == ModeLive {
		return &s.data.Live
	}
	return &s.data.Demo
}

func (s *StateStore) DailyLossBreached(mode TradingMode, equity, limitPct float64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetDayIfNeeded()
	m := s.modeState(mode)
	if equity <= 0 || limitPct <= 0 {
		return false
	}
	lossLimit := equity * limitPct / 100
	return m.DailyPnLUSDT <= -lossLimit
}

func (s *StateStore) ConsecutiveLossBreached(mode TradingMode, maxLosses int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetDayIfNeeded()
	m := s.modeState(mode)
	if maxLosses <= 0 {
		return false
	}
	if m.LossCooldownUntil != nil && time.Now().UTC().Before(*m.LossCooldownUntil) {
		return true
	}
	return m.ConsecutiveLosses >= maxLosses
}

func (s *StateStore) OpenCount(mode TradingMode) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetDayIfNeeded()
	return len(s.modeState(mode).OpenPositions)
}

func (s *StateStore) Register(rec TradeRecommendation, bucket string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetDayIfNeeded()
	m := s.modeState(rec.Mode)
	m.OpenPositions = append(m.OpenPositions, openPosition{
		Symbol:   rec.Signal.Symbol,
		Side:     rec.Side,
		Bucket:   bucket,
		Notional: rec.NotionalUSDT,
		OpenedAt: rec.Timestamp,
	})
	s.save()
}

// Close removes one matching position and makes circuit breakers reflect a
// completed outcome. Exchange reconciliation and paper simulation both call it.
func (s *StateStore) Close(mode TradingMode, symbol string, side Side, pnlUSDT float64, cooldown time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetDayIfNeeded()
	m := s.modeState(mode)
	for i, p := range m.OpenPositions {
		if p.Symbol == symbol && p.Side == side {
			m.OpenPositions = append(m.OpenPositions[:i], m.OpenPositions[i+1:]...)
			break
		}
	}
	m.DailyPnLUSDT += pnlUSDT
	if pnlUSDT < 0 {
		m.ConsecutiveLosses++
		if cooldown > 0 {
			until := time.Now().UTC().Add(cooldown)
			m.LossCooldownUntil = &until
		}
	} else {
		m.ConsecutiveLosses = 0
		m.LossCooldownUntil = nil
	}
	s.save()
}

type portfolioCheck struct {
	verdict  Verdict
	reasons  []string
	openCount int
	maxOpen   int
	bucketCount int
	bucketMax   int
}

func (s *StateStore) CheckPortfolio(cfg Config, mode TradingMode, rec TradeRecommendation, equity float64) portfolioCheck {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetDayIfNeeded()
	m := s.modeState(mode)
	bucket := bucketForSymbol(rec.Signal.Symbol, cfg.Portfolio.CorrelationBuckets)

	out := portfolioCheck{
		verdict:   VerdictApproved,
		openCount: len(m.OpenPositions),
		maxOpen:   cfg.maxOpenPositions(mode),
		bucketMax: cfg.Portfolio.MaxSameBucketSameSide,
	}

	if out.openCount >= out.maxOpen {
		out.verdict = VerdictRejected
		out.reasons = append(out.reasons, "max_open_positions")
		return out
	}

	sameSide := 0
	bucketSame := 0
	grossExposure := rec.NotionalUSDT
	for _, p := range m.OpenPositions {
		grossExposure += p.Notional
		if p.Side == rec.Side {
			sameSide++
		}
		if p.Bucket == bucket && p.Side == rec.Side {
			bucketSame++
		}
	}
	out.bucketCount = bucketSame

	if sameSide >= cfg.Portfolio.MaxTotalSameSide {
		out.verdict = VerdictRejected
		out.reasons = append(out.reasons, "max_total_same_side")
		return out
	}
	if bucketSame >= cfg.Portfolio.MaxSameBucketSameSide {
		out.verdict = VerdictRejected
		out.reasons = append(out.reasons, "correlation_bucket_full")
		return out
	}
	if equity > 0 && grossExposure > equity*cfg.Portfolio.MaxGrossExposurePct/100 {
		out.verdict = VerdictReduced
		out.reasons = append(out.reasons, "gross_exposure_cap")
	}
	return out
}

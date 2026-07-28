package traders

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
)

const adaptiveLearnerVersion = "adaptive-direction/v1"

type adaptiveOutcome struct {
	Won       bool      `json:"won"`
	AlertType string    `json:"alert_type"`
	Score     int       `json:"score"`
	Inverted  bool      `json:"inverted"`
	ClosedAt  time.Time `json:"closed_at"`
}

type adaptiveState struct {
	Version         string            `json:"version"`
	InvertSignals   bool              `json:"invert_signals"`
	AdaptiveLearn   bool              `json:"adaptive_learn"`
	MinTapeAdjust   int               `json:"min_tape_adjust"`
	MinScoreAdjust  int               `json:"min_score_adjust"`
	DailyTrades     map[string]int    `json:"daily_trades"`
	RecentOutcomes  []adaptiveOutcome `json:"recent_outcomes"`
	LastRollingWR   float64           `json:"last_rolling_wr"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

// AdaptiveLearner tightens or loosens tape filters from realised paper/demo
// closes. It never changes invert direction once enabled by config.
type AdaptiveLearner struct {
	mu              sync.Mutex
	path            string
	invertSignals   bool
	adaptiveLearn   bool
	maxTradesPerDay int
	minTapeAdjust   int
	minScoreAdjust  int
	dailyTrades     map[string]int
	recent          []adaptiveOutcome
}

func NewAdaptiveLearner(logDir, profileID string, invert, adaptiveLearn bool, maxDaily int) *AdaptiveLearner {
	if maxDaily <= 0 {
		maxDaily = 100
	}
	l := &AdaptiveLearner{
		path:            filepath.Join(logDir, "traders", profileID, "adaptive.json"),
		invertSignals:   invert,
		adaptiveLearn:   adaptiveLearn,
		maxTradesPerDay: maxDaily,
		dailyTrades:     make(map[string]int),
	}
	l.load()
	return l
}

func (l *AdaptiveLearner) InvertEnabled() bool {
	return l.invertSignals
}

func (l *AdaptiveLearner) EffectiveMinTapePoints(base int) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	need := base + l.minTapeAdjust
	if need < 1 {
		return 1
	}
	if need > 5 {
		return 5
	}
	return need
}

func (l *AdaptiveLearner) EffectiveMinScore(base int) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	score := base + l.minScoreAdjust
	if score < 25 {
		return 25
	}
	if score > 90 {
		return 90
	}
	return score
}

func (l *AdaptiveLearner) CanOpenToday() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	key := time.Now().UTC().Format("2006-01-02")
	return l.dailyTrades[key] < l.maxTradesPerDay
}

func (l *AdaptiveLearner) RecordOpen() {
	l.mu.Lock()
	key := time.Now().UTC().Format("2006-01-02")
	l.dailyTrades[key]++
	l.mu.Unlock()
	l.save()
}

func (l *AdaptiveLearner) RecordClose(won bool, sig analyzer.Signal) {
	if l == nil {
		return
	}
	l.mu.Lock()
	outcome := adaptiveOutcome{
		Won: won, AlertType: sig.AlertType, Score: sig.Score,
		Inverted: l.invertSignals, ClosedAt: time.Now().UTC(),
	}
	l.recent = append(l.recent, outcome)
	if len(l.recent) > 200 {
		l.recent = l.recent[len(l.recent)-200:]
	}
	if l.adaptiveLearn {
		l.recalcAdjustmentsLocked()
	}
	l.mu.Unlock()
	l.save()
}

func (l *AdaptiveLearner) RollingWinRate(window int) float64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	if window <= 0 || len(l.recent) == 0 {
		return 0
	}
	start := 0
	if len(l.recent) > window {
		start = len(l.recent) - window
	}
	wins := 0
	total := 0
	for _, o := range l.recent[start:] {
		total++
		if o.Won {
			wins++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(wins) / float64(total)
}

func (l *AdaptiveLearner) recalcAdjustmentsLocked() {
	window := 50
	if len(l.recent) < 20 {
		return
	}
	start := 0
	if len(l.recent) > window {
		start = len(l.recent) - window
	}
	wins := 0
	total := 0
	for _, o := range l.recent[start:] {
		total++
		if o.Won {
			wins++
		}
	}
	wr := float64(wins) / float64(total)
	switch {
	case wr >= 0.70:
		l.minTapeAdjust = -1
		l.minScoreAdjust = -3
	case wr >= 0.55:
		l.minTapeAdjust = 0
		l.minScoreAdjust = 0
	case wr >= 0.45:
		l.minTapeAdjust = 1
		l.minScoreAdjust = 2
	default:
		l.minTapeAdjust = 2
		l.minScoreAdjust = 5
	}
}

func (l *AdaptiveLearner) load() {
	data, err := os.ReadFile(l.path)
	if err != nil {
		return
	}
	var state adaptiveState
	if json.Unmarshal(data, &state) != nil {
		return
	}
	if state.AdaptiveLearn {
		l.adaptiveLearn = true
	}
	l.minTapeAdjust = state.MinTapeAdjust
	l.minScoreAdjust = state.MinScoreAdjust
	if state.DailyTrades != nil {
		l.dailyTrades = state.DailyTrades
	}
	l.recent = state.RecentOutcomes
}

func (l *AdaptiveLearner) save() {
	l.mu.Lock()
	state := adaptiveState{
		Version:        adaptiveLearnerVersion,
		InvertSignals:  l.invertSignals,
		AdaptiveLearn:  l.adaptiveLearn,
		MinTapeAdjust:  l.minTapeAdjust,
		MinScoreAdjust: l.minScoreAdjust,
		DailyTrades:    l.dailyTrades,
		RecentOutcomes: append([]adaptiveOutcome(nil), l.recent...),
		LastRollingWR:  l.rollingWRLocked(50),
		UpdatedAt:      time.Now().UTC(),
	}
	l.mu.Unlock()
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	_ = writeAtomic(l.path, data)
}

func (l *AdaptiveLearner) rollingWRLocked(window int) float64 {
	if window <= 0 || len(l.recent) == 0 {
		return 0
	}
	start := 0
	if len(l.recent) > window {
		start = len(l.recent) - window
	}
	wins := 0
	total := 0
	for _, o := range l.recent[start:] {
		total++
		if o.Won {
			wins++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(wins) / float64(total)
}

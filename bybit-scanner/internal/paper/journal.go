package paper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/risk"
)

type Trade struct {
	ID            string    `json:"id"`
	Symbol        string    `json:"symbol"`
	Direction     string    `json:"direction"`
	Side          string    `json:"side"`
	Score         int       `json:"score"`
	EntryPrice    float64   `json:"entry_price"`
	SuggestedSL   float64   `json:"suggested_sl"`
	SuggestedTP   float64   `json:"suggested_tp"`
	Leverage      int       `json:"leverage"`
	NotionalUSDT  float64   `json:"notional_usdt"`
	MarginUSDT    float64   `json:"margin_usdt"`
	RiskUSDT      float64   `json:"risk_usdt"`
	RiskPct       float64   `json:"risk_pct"`
	RiskReward    float64   `json:"risk_reward"`
	Mode          string    `json:"mode"`
	SlippagePct   float64   `json:"slippage_pct"`
	Triggers      []string  `json:"triggers"`
	VolumeRatio   float64   `json:"volume_ratio"`
	OIChange3m    float64   `json:"oi_change_3m"`
	PriceChange1m float64   `json:"price_change_1m"`
	Status        string    `json:"status"`
	OpenedAt      time.Time `json:"opened_at"`
}

type Journal struct {
	mu     sync.Mutex
	path   string
	cfg    *config.Config
	trades []Trade
}

func New(cfg *config.Config, logDir string) *Journal {
	return &Journal{
		path:   filepath.Join(logDir, "paper_trades.jsonl"),
		cfg:    cfg,
		trades: make([]Trade, 0, 128),
	}
}

func (j *Journal) Record(rec risk.TradeRecommendation) {
	yamlCfg := j.cfg.Snapshot()
	if !yamlCfg.Paper.Enabled {
		return
	}

	sig := rec.Signal
	tr := Trade{
		ID:            sig.Timestamp.Format("20060102150405") + "-" + sig.Symbol,
		Symbol:        sig.Symbol,
		Direction:     sig.Movement,
		Side:          string(rec.Side),
		Score:         sig.Score,
		EntryPrice:    rec.Entry,
		SuggestedSL:   rec.StopLoss,
		SuggestedTP:   rec.TakeProfit,
		Leverage:      rec.Leverage,
		NotionalUSDT:  rec.NotionalUSDT,
		MarginUSDT:    rec.MarginUSDT,
		RiskUSDT:      rec.RiskUSDT,
		RiskPct:       rec.RiskPct,
		RiskReward:    rec.RiskReward,
		Mode:          string(rec.Mode),
		SlippagePct:   yamlCfg.Paper.SlippagePct,
		Triggers:      triggersToStrings(sig.Triggers),
		VolumeRatio:   sig.VolumeRatio,
		OIChange3m:    sig.OIChange3m,
		PriceChange1m: sig.PriceChange1m,
		Status:        "open",
		OpenedAt:      sig.Timestamp,
	}

	j.mu.Lock()
	j.trades = append(j.trades, tr)
	j.mu.Unlock()

	j.appendFile(tr)
}

func (j *Journal) appendFile(tr Trade) {
	data, err := json.Marshal(tr)
	if err != nil {
		return
	}
	f, err := os.OpenFile(j.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(data, '\n'))
}

func (j *Journal) OpenCount() int {
	j.mu.Lock()
	defer j.mu.Unlock()
	n := 0
	for _, t := range j.trades {
		if t.Status == "open" {
			n++
		}
	}
	return n
}

func (j *Journal) Recent(n int) []Trade {
	j.mu.Lock()
	defer j.mu.Unlock()
	if n > len(j.trades) {
		n = len(j.trades)
	}
	out := make([]Trade, n)
	copy(out, j.trades[len(j.trades)-n:])
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func triggersToStrings(triggers []analyzer.TriggerType) []string {
	out := make([]string, len(triggers))
	for i, t := range triggers {
		out[i] = string(t)
	}
	return out
}

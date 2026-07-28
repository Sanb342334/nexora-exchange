package traders

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"bybit-scanner/internal/risk"
)

type Journal struct {
	mu   sync.Mutex
	path string
}

type HistoryEntry struct {
	SignalID    string
	Symbol      string
	Side        risk.Side
	Score       int
	Entry       float64
	MarkPrice   float64
	StopLoss    float64
	TakeProfit  float64
	Unrealized  bool
	OpenedAt    time.Time
	ClosedAt    *time.Time
	PnL         *float64
	CloseReason string
	OrderID     string
	Demo        bool
	// Extended trade analytics
	AlertType     string
	SetupType     string
	Leverage      int
	NotionalUSDT  float64
	RiskUSDT      float64
	RiskReward    float64
	Mode          string
	Duration      time.Duration
	IndicatorTags []string
	ExitPrice     float64
}

func NewJournal(logDir, profileID string) *Journal {
	dir := filepath.Join(logDir, "traders", profileID)
	_ = os.MkdirAll(dir, 0o755)
	return &Journal{path: filepath.Join(dir, "trades.jsonl")}
}

func (j *Journal) Record(rec risk.TradeRecommendation, profileID, demoOrderID string) {
	j.mu.Lock()
	defer j.mu.Unlock()

	row := map[string]interface{}{
		"event":         "opened",
		"profile_id":    profileID,
		"signal_id":     rec.Signal.SignalID,
		"symbol":        rec.Signal.Symbol,
		"side":          rec.Side,
		"score":         rec.Signal.Score,
		"alert_type":    rec.Signal.AlertType,
		"setup":         rec.Signal.SetupType,
		"entry":         rec.Entry,
		"sl":            rec.StopLoss,
		"tp":            rec.TakeProfit,
		"leverage":      rec.Leverage,
		"notional_usdt": rec.NotionalUSDT,
		"risk_usdt":     rec.RiskUSDT,
		"rr":            rec.RiskReward,
		"opened_at":     rec.Timestamp,
		"demo":          demoOrderID != "",
		"demo_order_id": demoOrderID,
		"mode":          rec.Mode,
		"reasons":       rec.Signal.Reasons,
	}
	data, _ := json.Marshal(row)
	f, err := os.OpenFile(j.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(data, '\n'))
}

func (j *Journal) Recent(limit int) []HistoryEntry {
	unlimited := limit <= 0
	if !unlimited && limit < 1 {
		limit = 10
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	f, err := os.Open(j.path)
	if err != nil {
		return nil
	}
	defer f.Close()

	byOrder := make(map[string]HistoryEntry)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var row struct {
			Event         string    `json:"event"`
			SignalID      string    `json:"signal_id"`
			Symbol        string    `json:"symbol"`
			Side          risk.Side `json:"side"`
			Score         int       `json:"score"`
			AlertType     string    `json:"alert_type"`
			Setup         string    `json:"setup"`
			Entry         float64   `json:"entry"`
			StopLoss      float64   `json:"sl"`
			TakeProfit    float64   `json:"tp"`
			Leverage      int       `json:"leverage"`
			NotionalUSDT  float64   `json:"notional_usdt"`
			RiskUSDT      float64   `json:"risk_usdt"`
			RR            float64   `json:"rr"`
			OpenedAt      time.Time `json:"opened_at"`
			ClosedAt      time.Time `json:"closed_at"`
			RealizedPnL   *float64  `json:"realized_pnl"`
			CloseReason   string    `json:"close_reason"`
			OrderID       string    `json:"demo_order_id"`
			Demo          bool      `json:"demo"`
			Mode          string    `json:"mode"`
			Reasons       []string  `json:"reasons"`
			ExitPrice     float64   `json:"exit_price"`
		}
		if json.Unmarshal(scanner.Bytes(), &row) != nil {
			continue
		}
		key := row.OrderID
		if key == "" {
			key = row.SignalID
		}
		if key == "" {
			key = row.Symbol + "-" + row.OpenedAt.Format(time.RFC3339Nano)
		}
		if row.Event == "closed" {
			e := byOrder[key]
			e.Symbol = row.Symbol
			e.SignalID = row.SignalID
			e.Side = row.Side
			e.OrderID = row.OrderID
			e.ClosedAt = &row.ClosedAt
			e.PnL = row.RealizedPnL
			e.CloseReason = row.CloseReason
			e.Demo = row.Demo || row.OrderID != ""
			e.ExitPrice = row.ExitPrice
			if !row.OpenedAt.IsZero() && !row.ClosedAt.IsZero() {
				e.Duration = row.ClosedAt.Sub(row.OpenedAt)
			}
			byOrder[key] = e
			continue
		}
		byOrder[key] = HistoryEntry{
			SignalID: row.SignalID, Symbol: row.Symbol, Side: row.Side, Score: row.Score,
			Entry: row.Entry, StopLoss: row.StopLoss, TakeProfit: row.TakeProfit,
			OpenedAt: row.OpenedAt, OrderID: row.OrderID, Demo: row.Demo,
			AlertType: row.AlertType, SetupType: row.Setup, Leverage: row.Leverage,
			NotionalUSDT: row.NotionalUSDT, RiskUSDT: row.RiskUSDT, RiskReward: row.RR,
			Mode: row.Mode, IndicatorTags: filterIndicatorTags(row.Reasons),
		}
	}
	out := make([]HistoryEntry, 0, len(byOrder))
	for _, e := range byOrder {
		if e.ClosedAt != nil && e.OpenedAt.IsZero() {
			// closed-only row without open metadata
		} else if e.ClosedAt != nil && e.Duration == 0 {
			e.Duration = e.ClosedAt.Sub(e.OpenedAt)
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, k int) bool {
		return out[i].OpenedAt.After(out[k].OpenedAt)
	})
	if !unlimited && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func filterIndicatorTags(reasons []string) []string {
	var tags []string
	for _, r := range reasons {
		if strings.HasPrefix(r, "5m:") || strings.HasPrefix(r, "mtf:") || strings.HasPrefix(r, "carry_") {
			tags = append(tags, r)
		}
	}
	return tags
}

func (j *Journal) RecordClose(rec risk.TradeRecommendation, profileID, demoOrderID string, pnl float64, reason string, closedAt time.Time) {
	j.mu.Lock()
	defer j.mu.Unlock()
	exit := rec.Entry
	if rec.Signal.Price > 0 && rec.Qty > 0 && pnl != 0 {
		delta := pnl / rec.Qty
		if rec.Side == risk.SideLong {
			exit = rec.Entry + delta
		} else {
			exit = rec.Entry - delta
		}
	}
	row := map[string]interface{}{
		"event":         "closed",
		"profile_id":    profileID,
		"signal_id":     rec.Signal.SignalID,
		"symbol":        rec.Signal.Symbol,
		"side":          rec.Side,
		"score":         rec.Signal.Score,
		"alert_type":    rec.Signal.AlertType,
		"setup":         rec.Signal.SetupType,
		"entry":         rec.Entry,
		"exit_price":    exit,
		"sl":            rec.StopLoss,
		"tp":            rec.TakeProfit,
		"leverage":      rec.Leverage,
		"notional_usdt": rec.NotionalUSDT,
		"risk_usdt":     rec.RiskUSDT,
		"rr":            rec.RiskReward,
		"opened_at":     rec.Timestamp,
		"demo_order_id": demoOrderID,
		"demo":          demoOrderID != "",
		"realized_pnl":  pnl,
		"close_reason":  reason,
		"closed_at":     closedAt,
		"mode":          rec.Mode,
		"reasons":       rec.Signal.Reasons,
	}
	data, _ := json.Marshal(row)
	f, err := os.OpenFile(j.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(data, '\n'))
}

func FormatDuration(d time.Duration) string {
	if d <= 0 {
		return "—"
	}
	if d < time.Minute {
		return d.Truncate(time.Second).String()
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if m == 0 {
		return fmt.Sprintf("%dч", h)
	}
	return fmt.Sprintf("%dч %dm", h, m)
}

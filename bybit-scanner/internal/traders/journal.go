package traders

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"bybit-scanner/internal/risk"
)

type Journal struct {
	mu   sync.Mutex
	path string
}

type HistoryEntry struct {
	Symbol      string
	Side        risk.Side
	Score       int
	Entry       float64
	OpenedAt    time.Time
	ClosedAt    *time.Time
	PnL         *float64
	CloseReason string
	OrderID     string
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
	if limit <= 0 {
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
			Event       string    `json:"event"`
			Symbol      string    `json:"symbol"`
			Side        risk.Side `json:"side"`
			Score       int       `json:"score"`
			Entry       float64   `json:"entry"`
			OpenedAt    time.Time `json:"opened_at"`
			ClosedAt    time.Time `json:"closed_at"`
			RealizedPnL *float64  `json:"realized_pnl"`
			CloseReason string    `json:"close_reason"`
			OrderID     string    `json:"demo_order_id"`
		}
		if json.Unmarshal(scanner.Bytes(), &row) != nil {
			continue
		}
		key := row.OrderID
		if key == "" {
			key = row.Symbol + "-" + row.OpenedAt.Format(time.RFC3339Nano)
		}
		if row.Event == "closed" {
			e := byOrder[key]
			e.Symbol = row.Symbol
			e.Side = row.Side
			e.OrderID = row.OrderID
			e.ClosedAt = &row.ClosedAt
			e.PnL = row.RealizedPnL
			e.CloseReason = row.CloseReason
			byOrder[key] = e
			continue
		}
		byOrder[key] = HistoryEntry{
			Symbol: row.Symbol, Side: row.Side, Score: row.Score,
			Entry: row.Entry, OpenedAt: row.OpenedAt, OrderID: row.OrderID,
		}
	}
	out := make([]HistoryEntry, 0, len(byOrder))
	for _, e := range byOrder {
		out = append(out, e)
	}
	sort.Slice(out, func(i, k int) bool {
		return out[i].OpenedAt.After(out[k].OpenedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (j *Journal) RecordClose(rec risk.TradeRecommendation, profileID, demoOrderID string, pnl float64, reason string, closedAt time.Time) {
	j.mu.Lock()
	defer j.mu.Unlock()
	row := map[string]interface{}{
		"event":         "closed",
		"profile_id":    profileID,
		"symbol":        rec.Signal.Symbol,
		"side":          rec.Side,
		"demo_order_id": demoOrderID,
		"realized_pnl":  pnl,
		"close_reason":  reason,
		"closed_at":     closedAt,
	}
	data, _ := json.Marshal(row)
	f, err := os.OpenFile(j.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(data, '\n'))
}

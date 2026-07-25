package execution

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"bybit-scanner/internal/risk"
)

// ClosedPnL is the authoritative closed trade record reported by Bybit Demo.
type ClosedPnL struct {
	OrderID     string
	Symbol      string
	Side        risk.Side
	ClosedPnL   float64
	UpdatedAt   time.Time
	CloseReason string
}

func (t *DemoTrader) ClosedPnL(ctx context.Context, limit int) ([]ClosedPnL, error) {
	if !t.Enabled() {
		return nil, fmt.Errorf("demo autotrade disabled")
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	raw, err := t.client.GetSigned(ctx, "/v5/position/closed-pnl",
		fmt.Sprintf("category=linear&limit=%d", limit))
	if err != nil {
		return nil, err
	}
	var parsed struct {
		List []struct {
			OrderID     string `json:"orderId"`
			Symbol      string `json:"symbol"`
			Side        string `json:"side"`
			ClosedPnL   string `json:"closedPnl"`
			UpdatedTime string `json:"updatedTime"`
			CloseType   string `json:"closeType"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	out := make([]ClosedPnL, 0, len(parsed.List))
	for _, row := range parsed.List {
		pnl, _ := strconv.ParseFloat(row.ClosedPnL, 64)
		ms, _ := strconv.ParseInt(row.UpdatedTime, 10, 64)
		side := risk.SideLong
		if row.Side == "Sell" {
			side = risk.SideShort
		}
		out = append(out, ClosedPnL{
			OrderID: row.OrderID, Symbol: row.Symbol, Side: side,
			ClosedPnL: pnl, UpdatedAt: time.UnixMilli(ms).UTC(),
			CloseReason: row.CloseType,
		})
	}
	return out, nil
}

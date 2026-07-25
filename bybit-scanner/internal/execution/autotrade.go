package execution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"bybit-scanner/internal/risk"
)

// ExecuteTrade opens a Bybit demo market order from an approved risk recommendation.
func (t *DemoTrader) ExecuteTrade(ctx context.Context, profileID string, rec risk.TradeRecommendation) (TestTradeResult, error) {
	var res TestTradeResult
	sig := rec.Signal
	unlock := t.lockSymbol(sig.Symbol)
	defer unlock()

	res.Symbol = sig.Symbol
	res.Side = sideToBybit(rec.Side)
	res.StopLoss = rec.StopLoss
	res.TakeProfit = rec.TakeProfit

	if !t.cfg.Ready() {
		return res, fmt.Errorf("demo API not configured")
	}
	if !t.cfg.AutoTrade {
		return res, fmt.Errorf("AUTO_TRADE_DEMO=false")
	}
	if err := ensureDemoHost(t.cfg.BaseURL); err != nil {
		return res, err
	}
	if rec.Entry <= 0 || rec.NotionalUSDT <= 0 {
		return res, fmt.Errorf("invalid sizing")
	}

	qtyStep, minQty, err := t.fetchLotRules(ctx, sig.Symbol)
	if err != nil {
		return res, fmt.Errorf("lot rules: %w", err)
	}

	qty := rec.Qty
	if qty <= 0 {
		qty = rec.NotionalUSDT / rec.Entry
	}
	qty = roundDown(qty, qtyStep)
	if qty < minQty {
		qty = minQty
	}
	if qty <= 0 {
		return res, fmt.Errorf("qty too small")
	}
	qtyStr := formatQty(qty, qtyStep)
	res.Qty = qtyStr
	res.Notional = qty * rec.Entry
	res.EntryPrice = rec.Entry

	if rec.Leverage > 0 {
		if err := t.setLeverage(ctx, sig.Symbol, rec.Leverage); err != nil {
			t.log.Errors.Warn().Err(err).Str("symbol", sig.Symbol).Int("lev", rec.Leverage).Msg("set leverage failed")
		}
	}

	intentID := demoIntentID(profileID, rec)
	t.mu.Lock()
	if prior, ok := t.intents[intentID]; ok && prior.OrderID != "" {
		t.mu.Unlock()
		return prior, nil
	}
	t.mu.Unlock()
	linkID := intentID
	res.OrderLink = linkID

	orderPayload := map[string]interface{}{
		"category":    "linear",
		"symbol":      sig.Symbol,
		"side":        res.Side,
		"orderType":   "Market",
		"qty":         qtyStr,
		"orderLinkId": linkID,
		"tpslMode":    "Full",
		"takeProfit":  formatPrice(rec.TakeProfit),
		"stopLoss":    formatPrice(rec.StopLoss),
		"tpTriggerBy": "LastPrice",
		"slTriggerBy": "LastPrice",
	}
	orderResult, err := t.client.PostSigned(ctx, "/v5/order/create", orderPayload)
	if err != nil {
		return res, fmt.Errorf("order create: %w", err)
	}
	res.OrderID = parseOrderID(orderResult)

	if err := t.applyStopsPrices(ctx, sig.Symbol, rec.StopLoss, rec.TakeProfit); err != nil {
		t.log.Errors.Error().Err(err).
			Str("trader", profileID).Str("symbol", sig.Symbol).
			Str("order_id", res.OrderID).
			Msg("demo order is unprotected; refusing to register trade")
		return res, fmt.Errorf("protective SL/TP could not be verified: %w", err)
	}
	res.Message = "Demo ордер + SL/TP OK"
	t.mu.Lock()
	t.intents[intentID] = res
	t.mu.Unlock()

	t.log.Scanner.Info().
		Str("trader", profileID).
		Str("symbol", sig.Symbol).
		Str("side", res.Side).
		Str("qty", qtyStr).
		Int("leverage", rec.Leverage).
		Float64("notional", res.Notional).
		Str("order_id", res.OrderID).
		Msg("demo autotrade executed")

	return res, nil
}

func demoIntentID(profileID string, rec risk.TradeRecommendation) string {
	stamp := rec.Timestamp.UTC().Format(time.RFC3339Nano)
	seed := strings.Join([]string{
		profileID, rec.Signal.SignalID, rec.Signal.Symbol, string(rec.Side), stamp,
	}, "|")
	sum := sha256.Sum256([]byte(seed))
	return fmt.Sprintf("nx-%s-%s", profileID, hex.EncodeToString(sum[:])[:20])
}

func sideToBybit(side risk.Side) string {
	if side == risk.SideShort {
		return "Sell"
	}
	return "Buy"
}

func (t *DemoTrader) setLeverage(ctx context.Context, symbol string, lev int) error {
	if lev <= 0 {
		return nil
	}
	payload := map[string]interface{}{
		"category":     "linear",
		"symbol":       symbol,
		"buyLeverage":  fmt.Sprintf("%d", lev),
		"sellLeverage": fmt.Sprintf("%d", lev),
	}
	_, err := t.client.PostSigned(ctx, "/v5/position/set-leverage", payload)
	if err != nil && (strings.Contains(err.Error(), "110043") || isBybitNotModified(err)) {
		return nil
	}
	return err
}

func (t *DemoTrader) applyStopsPrices(ctx context.Context, symbol string, sl, tp float64) error {
	if sl <= 0 || tp <= 0 {
		return fmt.Errorf("invalid sl/tp")
	}
	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		time.Sleep(time.Duration(400+attempt*350) * time.Millisecond)
		pos, err := t.fetchPosition(ctx, symbol)
		if err != nil {
			lastErr = err
			continue
		}
		if pos.Size <= 0 {
			lastErr = fmt.Errorf("position not ready")
			continue
		}
		if err := t.setTradingStop(ctx, symbol, sl, tp); err != nil {
			if isBybitNotModified(err) {
				return nil
			}
			lastErr = err
			continue
		}
		return nil
	}
	return lastErr
}

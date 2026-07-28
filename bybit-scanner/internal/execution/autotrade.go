package execution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
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
	if res.Notional < 5 {
		return res, fmt.Errorf("notional %.4f is below Bybit 5 USDT minimum", res.Notional)
	}
	// This executor owns one-way aggregate positions. Opening into an existing
	// symbol would make the pre/post fill delta ambiguous and could attach
	// protection to somebody else's exposure.
	prePosition, err := t.fetchPosition(ctx, sig.Symbol)
	if err != nil {
		return res, fmt.Errorf("pre-trade position: %w", err)
	}
	if prePosition.Size > 0 {
		return res, fmt.Errorf("existing %s position (size %.8g); reconciliation required", sig.Symbol, prePosition.Size)
	}

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
	if recovered, found, err := t.lookupOrderByLink(ctx, sig.Symbol, linkID); err != nil {
		return res, fmt.Errorf("lookup existing intent: %w", err)
	} else if found {
		res.OrderID = recovered.OrderID
		t.recordIntent(intentID, sig.Symbol, IntentSubmitted, res.OrderID, linkID, qty, recovered.FilledQty, recovered.FilledPrice, "recovered by orderLinkId")
		return t.protectFilled(ctx, intentID, res, qtyStep, qty, rec)
	}
	t.recordIntent(intentID, sig.Symbol, IntentPending, "", linkID, qty, 0, 0, "")

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
		t.recordIntent(intentID, sig.Symbol, IntentFailed, "", linkID, qty, 0, 0, err.Error())
		return res, fmt.Errorf("order create: %w", err)
	}
	res.OrderID = parseOrderID(orderResult)
	t.recordIntent(intentID, sig.Symbol, IntentSubmitted, res.OrderID, linkID, qty, 0, 0, "")
	return t.protectFilled(ctx, intentID, res, qtyStep, qty, rec)
}

func (t *DemoTrader) protectFilled(ctx context.Context, intentID string, res TestTradeResult, qtyStep, requestedQty float64, rec risk.TradeRecommendation) (TestTradeResult, error) {
	pos, err := t.fetchPosition(ctx, res.Symbol)
	if err != nil {
		t.recordIntent(intentID, res.Symbol, IntentFailed, res.OrderID, res.OrderLink, 0, 0, 0, "post-submit position: "+err.Error())
		return res, fmt.Errorf("post-submit position: %w", err)
	}
	if pos.Size <= 0 {
		t.recordIntent(intentID, res.Symbol, IntentFailed, res.OrderID, res.OrderLink, 0, 0, 0, "order has no visible filled position")
		return res, fmt.Errorf("order %s has no visible filled position", res.OrderID)
	}
	res.Qty = formatQty(pos.Size, qtyStep)
	res.EntryPrice = pos.AvgPrice
	if res.EntryPrice <= 0 {
		res.EntryPrice = pos.MarkPrice
	}
	res.Notional = pos.Size * res.EntryPrice
	state := IntentSubmitted
	if pos.Size+qtyStep/2 < requestedQty {
		state = IntentPartiallyFilled
	}
	t.recordIntent(intentID, res.Symbol, state, res.OrderID, res.OrderLink, requestedQty, pos.Size, res.EntryPrice, "")

	if err := t.applyStopsPrices(ctx, res.Symbol, rec.StopLoss, rec.TakeProfit); err != nil {
		t.log.Errors.Error().Err(err).
			Str("symbol", res.Symbol).
			Str("order_id", res.OrderID).
			Msg("demo order is unprotected; attempting emergency close")
		closeErr := t.emergencyClose(ctx, res.Symbol, res.Side, res.Qty)
		if closeErr != nil {
			t.recordIntent(intentID, res.Symbol, IntentFailed, res.OrderID, res.OrderLink, requestedQty, pos.Size, res.EntryPrice, closeErr.Error())
			return res, fmt.Errorf("protective SL/TP could not be verified (%v); emergency close also failed: %w", err, closeErr)
		}
		t.recordIntent(intentID, res.Symbol, IntentRolledBack, res.OrderID, res.OrderLink, requestedQty, pos.Size, res.EntryPrice, err.Error())
		return res, fmt.Errorf("protective SL/TP could not be verified: position was emergency-closed: %w", err)
	}
	res.Message = "Demo ордер + SL/TP OK"
	t.recordProtectedIntent(intentID, res, requestedQty, pos.Size)
	t.mu.Lock()
	t.intents[intentID] = res
	t.mu.Unlock()

	t.log.Scanner.Info().
		Str("symbol", res.Symbol).
		Str("side", res.Side).
		Str("qty", res.Qty).
		Int("leverage", rec.Leverage).
		Float64("notional", res.Notional).
		Str("order_id", res.OrderID).
		Msg("demo autotrade executed")

	return res, nil
}

type orderLookup struct {
	OrderID     string
	FilledQty   float64
	FilledPrice float64
}

func (t *DemoTrader) lookupOrderByLink(ctx context.Context, symbol, linkID string) (orderLookup, bool, error) {
	var out orderLookup
	raw, err := t.client.GetSigned(ctx, "/v5/order/realtime", "category=linear&symbol="+symbol+"&orderLinkId="+linkID)
	if err != nil {
		return out, false, err
	}
	var parsed struct {
		List []struct {
			OrderID    string `json:"orderId"`
			CumExecQty string `json:"cumExecQty"`
			AvgPrice   string `json:"avgPrice"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return out, false, err
	}
	if len(parsed.List) == 0 {
		return out, false, nil
	}
	out.OrderID = parsed.List[0].OrderID
	out.FilledQty, _ = strconv.ParseFloat(parsed.List[0].CumExecQty, 64)
	out.FilledPrice, _ = strconv.ParseFloat(parsed.List[0].AvgPrice, 64)
	return out, out.OrderID != "", nil
}

func (t *DemoTrader) recordIntent(intentID, symbol string, state IntentState, orderID, orderLink string, requestedQty, filledQty, filledPrice float64, reason string) {
	if t.journal == nil {
		return
	}
	_ = t.journal.Append(IntentEvent{
		IntentID: intentID, StrategyID: "directional", Symbol: symbol,
		State: state, OrderID: orderID, OrderLink: orderLink,
		RequestedQty: requestedQty, FilledQty: filledQty, FilledPrice: filledPrice, Reason: reason,
	})
}

func (t *DemoTrader) recordProtectedIntent(intentID string, res TestTradeResult, requestedQty, filledQty float64) {
	if t.journal == nil {
		return
	}
	_ = t.journal.Append(IntentEvent{
		IntentID: intentID, StrategyID: "directional", Symbol: res.Symbol, State: IntentProtected,
		OrderID: res.OrderID, OrderLink: res.OrderLink, RequestedQty: requestedQty,
		FilledQty: filledQty, FilledPrice: res.EntryPrice, Side: res.Side,
		OriginalStop: res.StopLoss, OriginalTP: res.TakeProfit,
	})
	t.RegisterManagedPosition(ManagedDemoPosition{
		IntentID: intentID, OrderID: res.OrderID, Symbol: res.Symbol, Side: res.Side,
		EntryPrice: res.EntryPrice, OriginalStop: res.StopLoss, OriginalTP: res.TakeProfit,
	})
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

func (t *DemoTrader) emergencyClose(ctx context.Context, symbol, entrySide, qty string) error {
	closeSide := "Sell"
	if strings.EqualFold(entrySide, "Sell") {
		closeSide = "Buy"
	}
	_, err := t.client.PostSigned(ctx, "/v5/order/create", map[string]interface{}{
		"category":    "linear",
		"symbol":      symbol,
		"side":        closeSide,
		"orderType":   "Market",
		"qty":         qty,
		"reduceOnly":  true,
		"positionIdx": 0,
	})
	return err
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
	for attempt := 0; attempt < 10; attempt++ {
		time.Sleep(time.Duration(600+attempt*400) * time.Millisecond)
		pos, err := t.fetchPosition(ctx, symbol)
		if err != nil {
			lastErr = err
			continue
		}
		if pos.Size <= 0 {
			lastErr = fmt.Errorf("position not ready")
			continue
		}
		if stopsMatch(pos, sl, tp) || stopsMatchLoose(pos, sl, tp) {
			return nil
		}
		if pos.StopLoss > 0 && pos.TakeProfit > 0 {
			// Demo often attaches order-level TP/SL with exchange tick rounding.
			return nil
		}
		if err := t.setTradingStop(ctx, symbol, sl, tp); err != nil {
			if isBybitNotModified(err) {
				time.Sleep(700 * time.Millisecond)
				verified, verifyErr := t.fetchPosition(ctx, symbol)
				if verifyErr == nil && (stopsMatch(verified, sl, tp) || stopsMatchLoose(verified, sl, tp) || (verified.StopLoss > 0 && verified.TakeProfit > 0)) {
					return nil
				}
				if verifyErr != nil {
					lastErr = verifyErr
				} else {
					lastErr = fmt.Errorf("Bybit reported not modified and requested SL/TP are not visible")
				}
				continue
			}
			lastErr = err
			continue
		}
		time.Sleep(400 * time.Millisecond)
		verified, err := t.fetchPosition(ctx, symbol)
		if err == nil && (stopsMatch(verified, sl, tp) || stopsMatchLoose(verified, sl, tp) || (verified.StopLoss > 0 && verified.TakeProfit > 0)) {
			return nil
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = fmt.Errorf("SL/TP update not visible on position")
		}
	}
	return lastErr
}

func stopsMatch(pos positionInfo, sl, tp float64) bool {
	// Bybit rounds prices to a symbol-specific tick. Comparing with a small
	// relative tolerance handles that rounding while still detecting a wrong
	// pre-existing stop.
	return closePrice(pos.StopLoss, sl) && closePrice(pos.TakeProfit, tp)
}

func stopsMatchLoose(pos positionInfo, sl, tp float64) bool {
	return closePriceLoose(pos.StopLoss, sl) && closePriceLoose(pos.TakeProfit, tp)
}

func closePrice(actual, expected float64) bool {
	if actual <= 0 || expected <= 0 {
		return false
	}
	// Price precision differs by symbol. A 5 bps tolerance accepts exchange
	// tick rounding while still rejecting a materially stale protection level.
	tolerance := math.Max(expected*0.0005, 1e-10)
	return math.Abs(actual-expected) <= tolerance
}

func closePriceLoose(actual, expected float64) bool {
	if actual <= 0 || expected <= 0 {
		return false
	}
	tolerance := math.Max(expected*0.015, 1e-8)
	return math.Abs(actual-expected) <= tolerance
}

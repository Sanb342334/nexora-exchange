package execution

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"
)

// DemoPosition is an exchange-authoritative snapshot of a position which this
// process created. It intentionally never represents arbitrary Demo exposure.
type DemoPosition struct {
	IntentID     string
	OrderID      string
	Symbol       string
	Side         string
	Size         float64
	AvgPrice     float64
	MarkPrice    float64
	StopLoss     float64
	TakeProfit   float64
	OriginalStop float64
	OriginalTP   float64
}

// ProtectionPreview is suitable for a confirmation UI. RiskWidening means the
// requested stop increases the loss possible from the exchange entry price.
type ProtectionPreview struct {
	Position               DemoPosition
	RequestedStopLoss      float64
	RequestedTakeProfit    float64
	RiskWidening           bool
	RiskIncreasePerUnit    float64
	StopMovedAwayFromEntry bool
}

// CloseResult is returned only after the exchange position was re-read.
type CloseResult struct {
	Position       DemoPosition
	ClosedQuantity float64
	RemainingSize  float64
	FullyClosed    bool
}

// DemoPosition returns the current Bybit state only for an explicitly managed
// position. Demo credentials alone never grant control over an arbitrary
// account position.
func (t *DemoTrader) DemoPosition(ctx context.Context, symbol string) (DemoPosition, error) {
	if err := t.controlsReady(); err != nil {
		return DemoPosition{}, err
	}
	managed, err := t.managedPosition(symbol)
	if err != nil {
		return DemoPosition{}, err
	}
	pos, err := t.fetchPosition(ctx, managed.Symbol)
	if err != nil {
		return DemoPosition{}, fmt.Errorf("read position: %w", err)
	}
	if pos.Size <= 0 {
		t.forgetManagedPosition(managed.Symbol)
		return DemoPosition{}, fmt.Errorf("bot-owned position %s is no longer open", managed.Symbol)
	}
	if !strings.EqualFold(pos.Side, managed.Side) {
		return DemoPosition{}, fmt.Errorf("bot-owned position %s side changed from %s to %s; reconciliation required", managed.Symbol, managed.Side, pos.Side)
	}
	return demoPositionFrom(managed, pos), nil
}

// PreviewProtection reads the current exchange position and reports whether a
// requested stop widens risk. Callers must explicitly present this warning
// before calling UpdateProtection when it is true.
func (t *DemoTrader) PreviewProtection(ctx context.Context, symbol string, stopLoss, takeProfit float64) (ProtectionPreview, error) {
	position, err := t.DemoPosition(ctx, symbol)
	if err != nil {
		return ProtectionPreview{}, err
	}
	if err := validateProtection(position, stopLoss, takeProfit); err != nil {
		return ProtectionPreview{}, err
	}
	previousRisk := stopRiskPerUnit(position.Side, position.AvgPrice, position.StopLoss)
	requestedRisk := stopRiskPerUnit(position.Side, position.AvgPrice, stopLoss)
	return ProtectionPreview{
		Position: position, RequestedStopLoss: stopLoss, RequestedTakeProfit: takeProfit,
		RiskWidening:           requestedRisk > previousRisk+priceTolerance(position.AvgPrice),
		RiskIncreasePerUnit:    math.Max(0, requestedRisk-previousRisk),
		StopMovedAwayFromEntry: math.Abs(stopLoss-position.AvgPrice) > math.Abs(position.StopLoss-position.AvgPrice)+priceTolerance(position.AvgPrice),
	}, nil
}

// UpdateProtection applies both SL and TP then verifies their actual Bybit
// values. Manual risk widening is permitted, but reported in the result so a
// caller can require a separate confirmation.
func (t *DemoTrader) UpdateProtection(ctx context.Context, symbol string, stopLoss, takeProfit float64) (ProtectionPreview, error) {
	unlock := t.lockSymbol(symbol)
	defer unlock()

	preview, err := t.PreviewProtection(ctx, symbol, stopLoss, takeProfit)
	if err != nil {
		return ProtectionPreview{}, err
	}
	if err := t.setTradingStop(ctx, preview.Position.Symbol, stopLoss, takeProfit); err != nil && !isBybitNotModified(err) {
		return ProtectionPreview{}, fmt.Errorf("update SL/TP: %w", err)
	}
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(300 * time.Millisecond)
		}
		verified, err := t.DemoPosition(ctx, preview.Position.Symbol)
		if err != nil {
			return ProtectionPreview{}, fmt.Errorf("verify SL/TP: %w", err)
		}
		if stopsMatch(positionInfo{StopLoss: verified.StopLoss, TakeProfit: verified.TakeProfit}, stopLoss, takeProfit) {
			preview.Position = verified
			return preview, nil
		}
	}
	return ProtectionPreview{}, fmt.Errorf("SL/TP update not visible on bot-owned position")
}

// ClosePosition closes quantity of a bot-owned position with a reduce-only
// market order. quantity=0 closes the full exchange-reported size.
func (t *DemoTrader) ClosePosition(ctx context.Context, symbol string, quantity float64) (CloseResult, error) {
	unlock := t.lockSymbol(symbol)
	defer unlock()

	position, err := t.DemoPosition(ctx, symbol)
	if err != nil {
		return CloseResult{}, err
	}
	closeQty := position.Size
	qtyText := ""
	if quantity > 0 {
		step, minQty, err := t.fetchLotRules(ctx, position.Symbol)
		if err != nil {
			return CloseResult{}, fmt.Errorf("close lot rules: %w", err)
		}
		closeQty = roundDown(quantity, step)
		if closeQty < minQty || closeQty <= 0 {
			return CloseResult{}, fmt.Errorf("close quantity %.8g is below the minimum %.8g", quantity, minQty)
		}
		if closeQty >= position.Size-priceTolerance(position.Size) {
			return CloseResult{}, fmt.Errorf("partial close quantity must be smaller than position size; use quantity 0 for full close")
		}
		qtyText = formatQty(closeQty, step)
	} else {
		// Position size comes from the exchange and is already valid for the
		// instrument's quantity step; do not introduce local rounding.
		current, err := t.fetchPosition(ctx, position.Symbol)
		if err != nil {
			return CloseResult{}, fmt.Errorf("refresh full-close quantity: %w", err)
		}
		if current.Size <= 0 || current.SizeText == "" {
			return CloseResult{}, fmt.Errorf("bot-owned position %s is no longer open", position.Symbol)
		}
		position.Size = current.Size
		qtyText = current.SizeText
	}
	closeSide := "Sell"
	if strings.EqualFold(position.Side, "Sell") {
		closeSide = "Buy"
	}
	_, err = t.client.PostSigned(ctx, "/v5/order/create", map[string]interface{}{
		"category": "linear", "symbol": position.Symbol, "side": closeSide,
		"orderType": "Market", "qty": qtyText, "reduceOnly": true, "positionIdx": 0,
	})
	if err != nil {
		return CloseResult{}, fmt.Errorf("reduce-only close: %w", err)
	}

	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(300 * time.Millisecond)
		}
		pos, err := t.fetchPosition(ctx, position.Symbol)
		if err != nil {
			return CloseResult{}, fmt.Errorf("verify close: %w", err)
		}
		if pos.Size >= position.Size-priceTolerance(position.Size) {
			continue
		}
		result := CloseResult{Position: demoPositionFrom(ManagedDemoPosition{
			IntentID: position.IntentID, OrderID: position.OrderID, Symbol: position.Symbol, Side: position.Side,
			OriginalStop: position.OriginalStop, OriginalTP: position.OriginalTP,
		}, pos), ClosedQuantity: position.Size - pos.Size, RemainingSize: pos.Size, FullyClosed: pos.Size <= 0}
		t.recordPositionClose(position, result)
		if result.FullyClosed {
			t.forgetManagedPosition(position.Symbol)
		}
		return result, nil
	}
	return CloseResult{}, fmt.Errorf("close order accepted but position size did not change; reconciliation required")
}

func (t *DemoTrader) controlsReady() error {
	if !t.cfg.Ready() {
		return fmt.Errorf("demo API not configured")
	}
	return ensureDemoHost(t.cfg.BaseURL)
}

func (t *DemoTrader) managedPosition(symbol string) (ManagedDemoPosition, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	t.exitMu.RLock()
	managed, ok := t.managed[symbol]
	t.exitMu.RUnlock()
	if !ok || managed.Symbol == "" || managed.OrderID == "" {
		return ManagedDemoPosition{}, fmt.Errorf("%s is not a bot-owned Demo position", symbol)
	}
	return managed, nil
}

// ManagedDemoSymbols returns only symbols that this process has explicitly
// registered as controllable Demo positions. It never queries account-wide
// exchange exposure.
func (t *DemoTrader) ManagedDemoSymbols() []string {
	t.exitMu.RLock()
	defer t.exitMu.RUnlock()
	symbols := make([]string, 0, len(t.managed))
	for symbol, position := range t.managed {
		if position.Symbol != "" && position.OrderID != "" {
			symbols = append(symbols, symbol)
		}
	}
	return symbols
}

func (t *DemoTrader) forgetManagedPosition(symbol string) {
	t.exitMu.Lock()
	delete(t.managed, symbol)
	t.exitMu.Unlock()
}

func demoPositionFrom(managed ManagedDemoPosition, position positionInfo) DemoPosition {
	return DemoPosition{
		IntentID: managed.IntentID, OrderID: managed.OrderID, Symbol: managed.Symbol, Side: position.Side,
		Size: position.Size, AvgPrice: position.AvgPrice, MarkPrice: position.MarkPrice,
		StopLoss: position.StopLoss, TakeProfit: position.TakeProfit,
		OriginalStop: managed.OriginalStop, OriginalTP: managed.OriginalTP,
	}
}

func validateProtection(position DemoPosition, stopLoss, takeProfit float64) error {
	if stopLoss <= 0 || takeProfit <= 0 {
		return fmt.Errorf("stop loss and take profit must both be positive")
	}
	if strings.EqualFold(position.Side, "Buy") && stopLoss >= takeProfit {
		return fmt.Errorf("long stop loss must be below take profit")
	}
	if strings.EqualFold(position.Side, "Sell") && stopLoss <= takeProfit {
		return fmt.Errorf("short stop loss must be above take profit")
	}
	return nil
}

func stopRiskPerUnit(side string, entry, stop float64) float64 {
	if strings.EqualFold(side, "Buy") {
		return math.Max(0, entry-stop)
	}
	return math.Max(0, stop-entry)
}

func priceTolerance(value float64) float64 {
	return math.Max(math.Abs(value)*1e-8, 1e-10)
}

func (t *DemoTrader) recordPositionClose(position DemoPosition, result CloseResult) {
	if t.journal == nil || position.IntentID == "" {
		return
	}
	state := IntentProtected
	if result.FullyClosed {
		state = IntentClosed
	}
	_ = t.journal.Append(IntentEvent{
		IntentID: position.IntentID, StrategyID: "directional", Symbol: position.Symbol, State: state,
		OrderID: position.OrderID, FilledQty: result.RemainingSize, FilledPrice: position.AvgPrice, Side: position.Side,
		OriginalStop: position.OriginalStop, OriginalTP: position.OriginalTP, Reason: "manual_demo_position_control",
	})
}

package execution

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/logger"
)

type DemoTrader struct {
	cfg         Config
	client      *Client
	log         *logger.Loggers
	journal     *EventJournal
	mu          sync.Mutex
	symbolLocks map[string]*sync.Mutex
	intents     map[string]TestTradeResult
	exitMu      sync.RWMutex
	exitPolicy  config.AdaptiveExitConfig
	managed     map[string]ManagedDemoPosition
	lastExitRun map[string]time.Time
}

type TestTradeResult struct {
	Symbol     string
	Side       string
	Qty        string
	EntryPrice float64
	Notional   float64
	StopLoss   float64
	TakeProfit float64
	OrderID    string
	OrderLink  string
	Message    string
}

func NewDemoTrader(log *logger.Loggers, logDir string) *DemoTrader {
	cfg := LoadConfig()
	journal := NewEventJournal(logDir)
	trader := &DemoTrader{
		cfg:         cfg,
		client:      NewClient(cfg),
		log:         log,
		journal:     journal,
		symbolLocks: make(map[string]*sync.Mutex),
		intents:     make(map[string]TestTradeResult),
		managed:     make(map[string]ManagedDemoPosition),
		lastExitRun: make(map[string]time.Time),
	}
	if projection, err := journal.Projection(); err == nil {
		for intentID, event := range projection {
			if event.State != IntentProtected || event.OrderID == "" {
				continue
			}
			trader.intents[intentID] = TestTradeResult{
				Symbol: event.Symbol, OrderID: event.OrderID, OrderLink: event.OrderLink,
				Qty: strconv.FormatFloat(event.FilledQty, 'f', -1, 64), EntryPrice: event.FilledPrice,
				Notional: event.FilledQty * event.FilledPrice,
			}
			if event.OriginalStop > 0 && event.OriginalTP > 0 && event.Side != "" {
				trader.managed[event.Symbol] = ManagedDemoPosition{
					IntentID: intentID, OrderID: event.OrderID, Symbol: event.Symbol, Side: event.Side,
					EntryPrice: event.FilledPrice, OriginalStop: event.OriginalStop, OriginalTP: event.OriginalTP,
				}
			}
		}
	}
	return trader
}

// SetAdaptiveExitPolicy is intentionally separate from the demo order toggle:
// callers may reload exit tuning, but it never grants live-trading access.
func (t *DemoTrader) SetAdaptiveExitPolicy(policy config.AdaptiveExitConfig) {
	t.exitMu.Lock()
	t.exitPolicy = policy
	t.exitMu.Unlock()
}

func (t *DemoTrader) RegisterManagedPosition(position ManagedDemoPosition) {
	if position.Symbol == "" || position.EntryPrice <= 0 || position.OriginalStop <= 0 || position.OriginalTP <= 0 {
		return
	}
	t.exitMu.Lock()
	if existing, ok := t.managed[position.Symbol]; ok && existing.IntentID != "" && position.IntentID == "" {
		// The event journal records the exchange-confirmed entry price. Keep
		// it over a reconstructed recommendation's estimated entry price.
		t.exitMu.Unlock()
		return
	}
	t.managed[position.Symbol] = position
	t.exitMu.Unlock()
}

// HandlePrice schedules at most one bounded asynchronous REST adjustment for a
// bot-owned Demo position. Market-data handlers never wait for exchange I/O.
func (t *DemoTrader) HandlePrice(symbol string, price float64) {
	if price <= 0 || !t.Enabled() || ensureDemoHost(t.cfg.BaseURL) != nil {
		return
	}
	t.exitMu.Lock()
	position, managed := t.managed[symbol]
	policy := t.exitPolicy
	now := time.Now()
	if !managed || !policy.Enabled || !intervalElapsed(t.lastExitRun[symbol], now, policy.MinUpdateIntervalSec) {
		t.exitMu.Unlock()
		return
	}
	// Preflight against bot-owned initial protection avoids position REST reads
	// before an exit threshold can possibly be reached.
	preview := CalculateExitAdjustment(policy, position, position.OriginalStop, position.OriginalTP, price)
	if !preview.ChangeStop && !preview.ChangeTP {
		t.exitMu.Unlock()
		return
	}
	t.lastExitRun[symbol] = now
	t.exitMu.Unlock()
	go t.applyAdaptiveExit(symbol, price)
}

func (t *DemoTrader) applyAdaptiveExit(symbol string, price float64) {
	unlock := t.lockSymbol(symbol)
	defer unlock()

	t.exitMu.RLock()
	position, managed := t.managed[symbol]
	policy := t.exitPolicy
	t.exitMu.RUnlock()
	if !managed || !policy.Enabled {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pos, err := t.fetchPosition(ctx, symbol)
	if err != nil {
		t.log.Errors.Warn().Err(err).Str("symbol", symbol).Msg("adaptive demo exit position read failed")
		return
	}
	if pos.Size <= 0 || !strings.EqualFold(pos.Side, position.Side) {
		return
	}
	if pos.StopLoss <= 0 || pos.TakeProfit <= 0 {
		t.log.Errors.Warn().Str("symbol", symbol).Msg("adaptive demo exit skipped: existing protection is incomplete")
		return
	}
	adjustment := CalculateExitAdjustment(policy, position, pos.StopLoss, pos.TakeProfit, price)
	if !adjustment.ChangeStop && !adjustment.ChangeTP {
		return
	}
	nextStop, nextTP := pos.StopLoss, pos.TakeProfit
	if adjustment.ChangeStop {
		nextStop = adjustment.StopLoss
	}
	if adjustment.ChangeTP {
		nextTP = adjustment.TakeProfit
	}
	if err := t.setTradingStop(ctx, symbol, nextStop, nextTP); err != nil && !isBybitNotModified(err) {
		t.log.Errors.Warn().Err(err).Str("symbol", symbol).Float64("r", adjustment.R).Msg("adaptive demo exit update failed")
		return
	}
	time.Sleep(300 * time.Millisecond)
	verified, err := t.fetchPosition(ctx, symbol)
	if err != nil || verified.Size <= 0 ||
		(adjustment.ChangeStop && !closePrice(verified.StopLoss, nextStop)) ||
		(adjustment.ChangeTP && !closePrice(verified.TakeProfit, nextTP)) {
		if err == nil {
			err = fmt.Errorf("protection update not visible")
		}
		t.log.Errors.Warn().Err(err).Str("symbol", symbol).Float64("r", adjustment.R).Msg("adaptive demo exit verification failed")
		return
	}
	t.log.Scanner.Info().Str("symbol", symbol).Float64("r", adjustment.R).
		Float64("stop_loss", nextStop).Float64("take_profit", nextTP).Msg("adaptive demo exit updated")
}

func (t *DemoTrader) lockSymbol(symbol string) func() {
	t.mu.Lock()
	lock := t.symbolLocks[symbol]
	if lock == nil {
		lock = &sync.Mutex{}
		t.symbolLocks[symbol] = lock
	}
	t.mu.Unlock()
	lock.Lock()
	return lock.Unlock
}

func (t *DemoTrader) Enabled() bool {
	return t.cfg.Ready() && t.cfg.AutoTrade
}

func (t *DemoTrader) Configured() bool {
	return t.cfg.Ready()
}

func (t *DemoTrader) RunTestTrade(ctx context.Context) (TestTradeResult, error) {
	var res TestTradeResult
	res.Symbol = t.cfg.TestSymbol
	res.Side = "Buy"

	if !t.cfg.Ready() {
		return res, fmt.Errorf("demo API keys not configured (BYBIT_DEMO_API_KEY/SECRET in .env)")
	}
	if !t.cfg.AutoTrade {
		return res, fmt.Errorf("AUTO_TRADE_DEMO=false")
	}
	if err := ensureDemoHost(t.cfg.BaseURL); err != nil {
		return res, err
	}

	price, err := t.fetchLastPrice(ctx, res.Symbol)
	if err != nil {
		return res, fmt.Errorf("price: %w", err)
	}
	res.EntryPrice = price

	qtyStep, minQty, err := t.fetchLotRules(ctx, res.Symbol)
	if err != nil {
		return res, fmt.Errorf("lot rules: %w", err)
	}

	rawQty := t.cfg.TestNotional / price
	qty := roundDown(rawQty, qtyStep)
	if qty < minQty {
		qty = minQty
	}
	if qty <= 0 {
		return res, fmt.Errorf("qty too small for $%.0f at price %.2f", t.cfg.TestNotional, price)
	}
	qtyStr := formatQty(qty, qtyStep)
	res.Qty = qtyStr
	res.Notional = qty * price

	slPct := 0.005
	tpPct := 0.005
	res.StopLoss = price * (1 - slPct)
	res.TakeProfit = price * (1 + tpPct)

	linkID := fmt.Sprintf("demo-test-%d", time.Now().UnixMilli())
	res.OrderLink = linkID

	orderPayload := map[string]interface{}{
		"category":    "linear",
		"symbol":      res.Symbol,
		"side":        "Buy",
		"orderType":   "Market",
		"qty":         qtyStr,
		"orderLinkId": linkID,
	}
	orderResult, err := t.client.PostSigned(ctx, "/v5/order/create", orderPayload)
	if err != nil {
		return res, fmt.Errorf("order create: %w", err)
	}
	res.OrderID = parseOrderID(orderResult)

	if err := t.applyStops(ctx, res.Symbol, res.Side, res.StopLoss, res.TakeProfit); err != nil {
		if isBybitNotModified(err) {
			res.Message = "Demo market long открыт, SL/TP уже стоят на позиции"
			t.log.Scanner.Info().Str("symbol", res.Symbol).Msg("demo test SL/TP already set")
		} else {
			t.log.Errors.Warn().Err(err).Str("symbol", res.Symbol).Msg("demo test SL/TP set failed")
			res.Message = fmt.Sprintf("Ордер открыт, но SL/TP не установлены: %v", err)
		}
	} else {
		res.Message = "Demo market long открыт, SL/TP установлены"
	}

	t.log.Scanner.Info().
		Str("symbol", res.Symbol).
		Str("qty", qtyStr).
		Float64("notional", res.Notional).
		Str("order_id", res.OrderID).
		Msg("demo test trade executed")

	return res, nil
}

type positionInfo struct {
	Size       float64
	SizeText   string
	Side       string
	AvgPrice   float64
	MarkPrice  float64
	StopLoss   float64
	TakeProfit float64
}

func (t *DemoTrader) applyStops(ctx context.Context, symbol, side string, sl, tp float64) error {
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
		slPrice, tpPrice := sl, tp
		entry := pos.AvgPrice
		if entry <= 0 {
			entry = pos.MarkPrice
		}
		if entry > 0 {
			const slPct, tpPct = 0.005, 0.005
			if strings.EqualFold(side, "Buy") {
				slPrice = entry * (1 - slPct)
				tpPrice = entry * (1 + tpPct)
			} else {
				slPrice = entry * (1 + slPct)
				tpPrice = entry * (1 - tpPct)
			}
		}
		if err := t.setTradingStop(ctx, symbol, slPrice, tpPrice); err != nil {
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

func (t *DemoTrader) fetchPosition(ctx context.Context, symbol string) (positionInfo, error) {
	var out positionInfo
	raw, err := t.client.GetSigned(ctx, "/v5/position/list", "category=linear&symbol="+symbol)
	if err != nil {
		return out, err
	}
	var parsed struct {
		List []struct {
			Size       string `json:"size"`
			AvgPrice   string `json:"avgPrice"`
			MarkPrice  string `json:"markPrice"`
			StopLoss   string `json:"stopLoss"`
			TakeProfit string `json:"takeProfit"`
			Side       string `json:"side"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return out, err
	}
	for _, p := range parsed.List {
		size, _ := strconv.ParseFloat(p.Size, 64)
		if size <= 0 {
			continue
		}
		out.Size = size
		out.SizeText = p.Size
		out.Side = p.Side
		out.AvgPrice, _ = strconv.ParseFloat(p.AvgPrice, 64)
		out.MarkPrice, _ = strconv.ParseFloat(p.MarkPrice, 64)
		out.StopLoss, _ = strconv.ParseFloat(p.StopLoss, 64)
		out.TakeProfit, _ = strconv.ParseFloat(p.TakeProfit, 64)
		return out, nil
	}
	return out, nil
}

func (t *DemoTrader) setTradingStop(ctx context.Context, symbol string, sl, tp float64) error {
	stopPayload := map[string]interface{}{
		"category":    "linear",
		"symbol":      symbol,
		"positionIdx": 0,
		"tpslMode":    "Full",
		"takeProfit":  formatPrice(tp),
		"stopLoss":    formatPrice(sl),
		"tpTriggerBy": "LastPrice",
		"slTriggerBy": "LastPrice",
	}
	_, err := t.client.PostSigned(ctx, "/v5/position/trading-stop", stopPayload)
	return err
}

func isBybitNotModified(err error) bool {
	return err != nil && strings.Contains(err.Error(), "34040")
}

func parseOrderID(raw json.RawMessage) string {
	var parsed struct {
		OrderID string `json:"orderId"`
	}
	_ = json.Unmarshal(raw, &parsed)
	return parsed.OrderID
}

func (t *DemoTrader) FetchWalletUSDT(ctx context.Context) (float64, error) {
	if !t.cfg.Ready() {
		return 0, fmt.Errorf("demo API not configured")
	}
	raw, err := t.client.GetSigned(ctx, "/v5/account/wallet-balance", "accountType=UNIFIED")
	if err != nil {
		return 0, err
	}
	var parsed struct {
		List []struct {
			Coin []struct {
				Coin          string `json:"coin"`
				Equity        string `json:"equity"`
				WalletBalance string `json:"walletBalance"`
			} `json:"coin"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return 0, err
	}
	for _, acct := range parsed.List {
		for _, c := range acct.Coin {
			if c.Coin == "USDT" {
				v, _ := strconv.ParseFloat(c.WalletBalance, 64)
				if v == 0 {
					v, _ = strconv.ParseFloat(c.Equity, 64)
				}
				return v, nil
			}
		}
	}
	return 0, fmt.Errorf("USDT balance not found")
}

func (t *DemoTrader) fetchLastPrice(ctx context.Context, symbol string) (float64, error) {
	raw, err := t.client.GetPublic(ctx, "/v5/market/tickers", "category=linear&symbol="+symbol)
	if err != nil {
		return 0, err
	}
	var parsed struct {
		List []struct {
			LastPrice string `json:"lastPrice"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return 0, err
	}
	if len(parsed.List) == 0 {
		return 0, fmt.Errorf("no ticker for %s", symbol)
	}
	return strconv.ParseFloat(parsed.List[0].LastPrice, 64)
}

func (t *DemoTrader) fetchLotRules(ctx context.Context, symbol string) (qtyStep, minQty float64, err error) {
	raw, err := t.client.GetPublic(ctx, "/v5/market/instruments-info", "category=linear&symbol="+symbol)
	if err != nil {
		return 0, 0, err
	}
	var parsed struct {
		List []struct {
			LotSizeFilter struct {
				QtyStep     string `json:"qtyStep"`
				MinOrderQty string `json:"minOrderQty"`
			} `json:"lotSizeFilter"`
		} `json:"list"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return 0, 0, err
	}
	if len(parsed.List) == 0 {
		return 0, 0, fmt.Errorf("no instrument info for %s", symbol)
	}
	qtyStep, _ = strconv.ParseFloat(parsed.List[0].LotSizeFilter.QtyStep, 64)
	minQty, _ = strconv.ParseFloat(parsed.List[0].LotSizeFilter.MinOrderQty, 64)
	if qtyStep <= 0 {
		qtyStep = 0.001
	}
	return qtyStep, minQty, nil
}

func roundDown(value, step float64) float64 {
	if step <= 0 {
		return value
	}
	return math.Floor(value/step) * step
}

func formatQty(qty, step float64) string {
	decimals := 0
	s := fmt.Sprintf("%f", step)
	if idx := strings.Index(s, "."); idx >= 0 {
		decimals = len(strings.TrimRight(s[idx+1:], "0"))
	}
	format := fmt.Sprintf("%%.%df", decimals)
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf(format, qty), "0"), ".")
}

func formatPrice(p float64) string {
	if p >= 1000 {
		return fmt.Sprintf("%.2f", p)
	}
	if p >= 1 {
		return fmt.Sprintf("%.4f", p)
	}
	return fmt.Sprintf("%.6f", p)
}

func FormatTestTradeHTML(r TestTradeResult, balance float64, enabled bool) string {
	var b strings.Builder
	b.WriteString("💹 <b>Demo Autotrade Test</b>\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━\n")
	if !enabled {
		b.WriteString("⚠️ <code>AUTO_TRADE_DEMO=false</code> — включи в .env\n\n")
	}
	if r.Message != "" {
		fmt.Fprintf(&b, "📨 <b>Demo order accepted:</b> %s\n", r.Message)
		b.WriteString("<i>Принятие заявки не подтверждает fill. Позиция и realised PnL сверяются с Bybit отдельно.</i>\n\n")
	}
	fmt.Fprintf(&b, "Symbol: <code>%s</code>\n", r.Symbol)
	fmt.Fprintf(&b, "Side: <b>%s</b> (Market)\n", r.Side)
	fmt.Fprintf(&b, "Qty: <code>%s</code>\n", r.Qty)
	fmt.Fprintf(&b, "Entry ≈ <code>$%.2f</code>\n", r.EntryPrice)
	fmt.Fprintf(&b, "Notional ≈ <b>$%.2f</b>\n", r.Notional)
	fmt.Fprintf(&b, "SL: <code>%s</code> (−0.5%%)\n", formatPrice(r.StopLoss))
	fmt.Fprintf(&b, "TP: <code>%s</code> (+0.5%%)\n", formatPrice(r.TakeProfit))
	if r.OrderID != "" {
		fmt.Fprintf(&b, "Order ID: <code>%s</code>\n", r.OrderID)
	}
	if balance > 0 {
		fmt.Fprintf(&b, "\n💰 Demo balance USDT: <b>%.2f</b>\n", balance)
	}
	b.WriteString("\n<i>Только demo-счёт (api-demo.bybit.com)</i>")
	return b.String()
}

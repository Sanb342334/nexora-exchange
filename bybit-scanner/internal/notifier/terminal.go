package notifier

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"bybit-scanner/internal/execution"
	"bybit-scanner/internal/risk"
	"bybit-scanner/internal/traders"
)

const (
	panelCallbackPrefix = "p1:"
	panelPageSize       = 6
	positionActionTTL   = 2 * time.Minute
)

type positionAction struct {
	chatID     int64
	symbol     string
	kind       string
	stopLoss   float64
	takeProfit float64
	expiresAt  time.Time
}

func panelCallback(parts ...string) string {
	return panelCallbackPrefix + strings.Join(parts, ":")
}

func validCallback(data string) bool {
	return data != "" && len([]byte(data)) <= 64
}

func (n *Notifier) sendPanel(ctx context.Context, chatID int64) {
	open := n.panelPositions()
	mode := "📝 PAPER"
	if n.traderMgr != nil && n.traderMgr.DemoAutotradeEnabled() {
		mode = "🏦 BYBIT DEMO aggregate"
	}
	uptime := "н/д"
	if n.health != nil {
		u, _, _, _, _, _, _, _ := n.health.Stats()
		uptime = u.Truncate(1e9).String()
	}
	overallPnL := 0.0
	if n.traderMgr != nil {
		_, overall := n.traderMgr.Dashboard()
		overallPnL = overall.TotalPnL
	}
	text := fmt.Sprintf(
		"🖥 <b>Trading terminal</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"+
			"Режим: <b>%s</b>\n"+
			"Автоторговля: <b>%s</b>\n"+
			"Kill switch: <b>%s</b>\n"+
			"Risk engine: <b>%s</b>\n"+
			"Uptime: <b>%s</b> · Universe: <b>%d</b>\n"+
			"Открытые позиции: <b>%d</b>\n"+
			"PnL профилей: <b>%+.2f USDT</b>\n\n"+
			"<i>Каждый профиль имеет режим исполнения: Demo aggregate-профили распределяют один Bybit-ордер, PAPER/SHADOW-профили остаются виртуальными. Mark PnL не является realised PnL.</i>",
		mode, boolLabel(n.traderMgr != nil && n.traderMgr.DemoAutotradeEnabled()),
		boolLabel(risk.LoadRuntimeFlags(0).KillSwitch), boolLabel(n.cfg.Snapshot().Risk.Enabled),
		uptime, n.getSymbolCount(), len(open), overallPnL,
	)
	_ = n.sendToChat(ctx, chatID, text, panelKeyboard())
}

func (n *Notifier) panelPositions() []traders.PanelPosition {
	if n.traderMgr == nil {
		return nil
	}
	profiles := n.traderMgr.AllProfiles()
	histories := make(map[string][]traders.HistoryEntry, len(profiles))
	for _, profile := range profiles {
		history, _ := n.traderMgr.History(profile.ID, 0)
		histories[profile.ID] = history
	}
	return traders.BuildPanelPositions(profiles, histories)
}

func (n *Notifier) sendOpenPositions(ctx context.Context, chatID int64, offset int) {
	positions := n.panelPositions()
	if offset < 0 {
		offset = 0
	}
	if offset >= len(positions) && len(positions) > 0 {
		offset = ((len(positions) - 1) / panelPageSize) * panelPageSize
	}
	end := offset + panelPageSize
	if end > len(positions) {
		end = len(positions)
	}
	text := "📂 <b>Открытые позиции</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"
	if len(positions) == 0 {
		text += "Открытых virtual allocations нет."
	} else {
		for _, position := range positions[offset:end] {
			pnl := 0.0
			if position.Entry.PnL != nil {
				pnl = *position.Entry.PnL
			}
			text += fmt.Sprintf("%s <b>%s</b> · %s %s · mark <b>%+.2f</b>\n",
				position.Emoji, position.ProfileName, position.Entry.Symbol, position.Entry.Side, pnl)
		}
	}
	_ = n.sendToChat(ctx, chatID, text, openPositionsKeyboard(positions, offset))
}

func (n *Notifier) sendPreferences(ctx context.Context, chatID int64) {
	snapshot := n.cfg.Snapshot()
	alerts := n.subscribers.WantsSignalLogs(chatID)
	text := fmt.Sprintf(
		"⚙️ <b>Настройки терминала</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"+
			"Alerts (signal logs): <b>%s</b>\n"+
			"Мин. score уведомлений: <b>%d</b>\n"+
			"Мин. ликвидность 1m: <b>$%.0f</b>\n"+
			"Adaptive exits: <b>%s</b>\n\n"+
			"<i>Здесь доступны только пользовательские alert-настройки; risk/live-параметры не меняются.</i>",
		boolLabel(alerts), n.cfg.TelegramMinNotifyScore(), snapshot.Strategy.MinVol1mUSDT,
		boolLabel(snapshot.AdaptiveExit.Enabled),
	)
	_ = n.sendToChat(ctx, chatID, text, preferencesKeyboard())
}

func (n *Notifier) sendSymbolPreferences(ctx context.Context, chatID int64, favorites bool) {
	favoriteSymbols, ignoredSymbols := n.subscribers.Symbols(chatID)
	symbols := ignoredSymbols
	title := "🔕 <b>Игнорируемые символы</b>"
	action := "i"
	if favorites {
		symbols = favoriteSymbols
		title = "⭐ <b>Избранные символы</b>"
		action = "f"
	}
	text := title + "\n━━━━━━━━━━━━━━━━━━━━\n\n"
	if len(symbols) == 0 {
		text += "Список пуст."
	} else {
		text += strings.Join(symbols, "\n")
	}
	rows := make([][]map[string]string, 0, len(symbols)+1)
	for _, symbol := range symbols {
		data := panelCallback(action, symbol)
		if validCallback(data) {
			rows = append(rows, []map[string]string{{"text": "Убрать " + symbol, "callback_data": data}})
		}
	}
	rows = append(rows, []map[string]string{{"text": "◀️ Настройки", "callback_data": panelCallback("s")}})
	_ = n.sendToChat(ctx, chatID, text, map[string]interface{}{"inline_keyboard": rows})
}

func (n *Notifier) routePanelCallback(ctx context.Context, chatID int64, data string) bool {
	if !strings.HasPrefix(data, panelCallbackPrefix) {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(data, panelCallbackPrefix), ":")
	if len(parts) == 0 {
		return true
	}
	switch parts[0] {
	case "h":
		n.sendPanel(ctx, chatID)
	case "o":
		if len(parts) == 2 {
			if offset, err := strconv.Atoi(parts[1]); err == nil {
				n.sendOpenPositions(ctx, chatID, offset)
			}
		}
	case "t":
		n.sendTradersOverview(ctx, chatID)
	case "r":
		n.sendTraderReport(ctx, chatID, "/report")
	case "d":
		if len(parts) == 2 {
			n.sendTraderDetail(ctx, chatID, "/trader "+parts[1])
		}
	case "y":
		if len(parts) == 3 {
			if offset, err := strconv.Atoi(parts[2]); err == nil {
				n.sendTraderHistoryPage(ctx, chatID, parts[1], offset)
			}
		}
	case "z":
		if len(parts) == 3 {
			n.sendTradeDetail(ctx, chatID, parts[1], parts[2])
		}
	case "x":
		if len(parts) == 3 {
			n.sendPositionDetail(ctx, chatID, parts[1], parts[2])
		}
	case "s":
		n.sendPreferences(ctx, chatID)
	case "f":
		if len(parts) == 1 {
			n.sendSymbolPreferences(ctx, chatID, true)
		} else if len(parts) == 2 {
			n.toggleFavorite(ctx, chatID, parts[1])
			n.sendSymbolPreferences(ctx, chatID, true)
		}
	case "i":
		if len(parts) == 1 {
			n.sendSymbolPreferences(ctx, chatID, false)
		} else if len(parts) == 2 {
			n.toggleIgnoredSymbol(ctx, chatID, parts[1])
			n.sendSymbolPreferences(ctx, chatID, false)
		}
	case "a":
		n.toggleSignalLogs(ctx, chatID)
		n.sendPreferences(ctx, chatID)
	case "m":
		if n.isTerminalOperator(chatID) {
			n.refreshDemoPositions(chatID)
		} else {
			n.sendControlDenied(ctx, chatID)
		}
	case "pc":
		if !n.isTerminalOperator(chatID) {
			n.sendControlDenied(ctx, chatID)
		} else if len(parts) == 2 {
			n.handlePositionAction(chatID, parts[1])
		}
	}
	return true
}

func panelKeyboard() map[string]interface{} {
	return map[string]interface{}{"inline_keyboard": [][]map[string]string{
		{{"text": "📂 Позиции", "callback_data": panelCallback("o", "0")}, {"text": "👥 Трейдеры", "callback_data": panelCallback("t")}},
		{{"text": "📊 Отчёт", "callback_data": panelCallback("r")}, {"text": "🏦 Demo позиции", "callback_data": panelCallback("m")}},
		{{"text": "⭐ Избранное", "callback_data": panelCallback("f")}, {"text": "🔕 Игнор", "callback_data": panelCallback("i")}},
		{{"text": "⚙️ Настройки", "callback_data": panelCallback("s")}, {"text": "🔄 Обновить", "callback_data": panelCallback("h")}},
	}}
}

func openPositionsKeyboard(positions []traders.PanelPosition, offset int) map[string]interface{} {
	rows := make([][]map[string]string, 0, panelPageSize+2)
	end := offset + panelPageSize
	if end > len(positions) {
		end = len(positions)
	}
	for _, position := range positions[offset:end] {
		data := panelCallback("x", position.ProfileID, position.Entry.SignalID)
		if validCallback(data) {
			rows = append(rows, []map[string]string{{"text": position.Emoji + " " + position.Entry.Symbol, "callback_data": data}})
		}
	}
	nav := make([]map[string]string, 0, 2)
	if offset > 0 {
		nav = append(nav, map[string]string{"text": "◀️ Ранее", "callback_data": panelCallback("o", strconv.Itoa(offset-panelPageSize))})
	}
	if end < len(positions) {
		nav = append(nav, map[string]string{"text": "Позже ▶️", "callback_data": panelCallback("o", strconv.Itoa(end))})
	}
	if len(nav) > 0 {
		rows = append(rows, nav)
	}
	rows = append(rows, []map[string]string{{"text": "◀️ Панель", "callback_data": panelCallback("h")}})
	return map[string]interface{}{"inline_keyboard": rows}
}

func preferencesKeyboard() map[string]interface{} {
	return map[string]interface{}{"inline_keyboard": [][]map[string]string{
		{{"text": "📡 Переключить alerts", "callback_data": panelCallback("a")}},
		{{"text": "⭐ Избранное", "callback_data": panelCallback("f")}, {"text": "🔕 Игнор", "callback_data": panelCallback("i")}},
		{{"text": "◀️ Панель", "callback_data": panelCallback("h")}},
	}}
}

func boolLabel(value bool) string {
	if value {
		return "ON"
	}
	return "OFF"
}

func (n *Notifier) isTerminalOperator(chatID int64) bool {
	return chatID != 0 && chatID == n.cfg.TelegramChatID
}

func (n *Notifier) sendControlDenied(ctx context.Context, chatID int64) {
	_ = n.sendToChat(ctx, chatID, "🔒 Управление Demo-позициями доступно только оператору.", nil)
}

// refreshDemoPositions moves exchange I/O out of Telegram's update-polling
// loop. The only symbols queried are process-owned Demo positions.
func (n *Notifier) refreshDemoPositions(chatID int64) {
	_ = n.sendToChat(context.Background(), chatID, "⏳ Обновляю bot-owned Demo позиции…", nil)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		n.sendDemoPositions(ctx, chatID)
	}()
}

func (n *Notifier) sendDemoPositions(ctx context.Context, chatID int64) {
	if n.demoTrader == nil || !n.demoTrader.Configured() {
		_ = n.sendToChat(ctx, chatID, "❌ Demo API не настроен.", panelKeyboard())
		return
	}
	symbols := n.demoTrader.ManagedDemoSymbols()
	if len(symbols) == 0 {
		_ = n.sendToChat(ctx, chatID, "🏦 <b>Demo позиции</b>\n\nНет bot-owned позиций для управления.", panelKeyboard())
		return
	}
	found := 0
	for _, symbol := range symbols {
		position, err := n.demoTrader.DemoPosition(ctx, symbol)
		if err != nil {
			continue // stale ownership is deliberately not presented as controllable.
		}
		found++
		_ = n.sendToChat(ctx, chatID, formatDemoPositionHTML(position), n.demoPositionKeyboard(chatID, position))
	}
	if found == 0 {
		_ = n.sendToChat(ctx, chatID, "🏦 <b>Demo позиции</b>\n\nBybit не подтвердил открытых bot-owned позиций. Reconciliation pending.", panelKeyboard())
	}
}

func formatDemoPositionHTML(position execution.DemoPosition) string {
	return fmt.Sprintf(
		"🏦 <b>Bot-owned Demo position</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"+
			"<b>%s %s</b> · size <code>%.8g</code>\n"+
			"Entry: <code>%.8g</code> · Mark: <code>%.8g</code>\n"+
			"SL: <code>%.8g</code> · TP: <code>%.8g</code>\n\n"+
			"<i>Данные только что сверены с Bybit. Управление доступно только для позиции, созданной этим ботом.</i>",
		position.Symbol, position.Side, position.Size, position.AvgPrice, position.MarkPrice, position.StopLoss, position.TakeProfit,
	)
}

func (n *Notifier) demoPositionKeyboard(chatID int64, position execution.DemoPosition) map[string]interface{} {
	rows := [][]map[string]string{
		{{"text": "🔄 Обновить", "callback_data": panelCallback("m")}},
		{{"text": "SL → Entry", "callback_data": n.newPositionAction(chatID, position.Symbol, "be", 0, 0)},
			{"text": "Восстановить SL/TP", "callback_data": n.newPositionAction(chatID, position.Symbol, "orig", 0, 0)}},
		{{"text": "Закрыть 25%", "callback_data": n.newPositionAction(chatID, position.Symbol, "c25", 0, 0)},
			{"text": "Закрыть 50%", "callback_data": n.newPositionAction(chatID, position.Symbol, "c50", 0, 0)}},
		{{"text": "⚠️ Закрыть полностью", "callback_data": n.newPositionAction(chatID, position.Symbol, "call", 0, 0)}},
		{{"text": "◀️ Панель", "callback_data": panelCallback("h")}},
	}
	return map[string]interface{}{"inline_keyboard": rows}
}

func (n *Notifier) newPositionAction(chatID int64, symbol, kind string, stopLoss, takeProfit float64) string {
	token := makePositionToken()
	n.positionMu.Lock()
	if n.positionActions == nil {
		n.positionActions = make(map[string]positionAction)
	}
	now := time.Now()
	for key, action := range n.positionActions {
		if now.After(action.expiresAt) {
			delete(n.positionActions, key)
		}
	}
	n.positionActions[token] = positionAction{
		chatID: chatID, symbol: strings.ToUpper(symbol), kind: kind, stopLoss: stopLoss, takeProfit: takeProfit,
		expiresAt: now.Add(positionActionTTL),
	}
	n.positionMu.Unlock()
	return panelCallback("pc", token)
}

func makePositionToken() string {
	var raw [9]byte
	if _, err := rand.Read(raw[:]); err != nil {
		// Timestamp is only a fallback for unavailable system entropy; scoped,
		// short-lived, one-use storage still prevents it becoming an authority.
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return base64.RawURLEncoding.EncodeToString(raw[:])
}

func (n *Notifier) consumePositionAction(chatID int64, token string) (positionAction, bool) {
	n.positionMu.Lock()
	defer n.positionMu.Unlock()
	action, ok := n.positionActions[token]
	if !ok || action.chatID != chatID || time.Now().After(action.expiresAt) {
		if ok && time.Now().After(action.expiresAt) {
			delete(n.positionActions, token)
		}
		return positionAction{}, false
	}
	delete(n.positionActions, token)
	return action, true
}

func (n *Notifier) handlePositionAction(chatID int64, token string) {
	action, ok := n.consumePositionAction(chatID, token)
	if !ok {
		_ = n.sendToChat(context.Background(), chatID, "⌛ Действие истекло или уже было использовано. Обнови позицию.", nil)
		return
	}
	if strings.HasPrefix(action.kind, "apply-") {
		_ = n.sendToChat(context.Background(), chatID, "⏳ Отправляю действие в Bybit и жду сверки…", nil)
		go n.executePositionAction(chatID, action)
		return
	}
	go n.preparePositionAction(chatID, action)
}

func (n *Notifier) preparePositionAction(chatID int64, action positionAction) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if n.demoTrader == nil {
		_ = n.sendToChat(ctx, chatID, "❌ Demo trader недоступен.", nil)
		return
	}
	position, err := n.demoTrader.DemoPosition(ctx, action.symbol)
	if err != nil {
		_ = n.sendToChat(ctx, chatID, "❌ Позиция не подтверждена Bybit: <code>"+err.Error()+"</code>", nil)
		return
	}
	switch action.kind {
	case "be":
		action.kind, action.stopLoss, action.takeProfit = "protect", position.AvgPrice, position.TakeProfit
	case "orig":
		action.kind, action.stopLoss, action.takeProfit = "protect", position.OriginalStop, position.OriginalTP
	case "manual":
		action.kind = "protect"
	}
	if action.kind == "protect" {
		preview, err := n.demoTrader.PreviewProtection(ctx, position.Symbol, action.stopLoss, action.takeProfit)
		if err != nil {
			_ = n.sendToChat(ctx, chatID, "❌ Небезопасный SL/TP: <code>"+err.Error()+"</code>", nil)
			return
		}
		action.symbol = preview.Position.Symbol
		confirm := n.newPositionAction(chatID, action.symbol, "apply-protect", action.stopLoss, action.takeProfit)
		warning := ""
		if preview.RiskWidening {
			warning = fmt.Sprintf("\n\n⚠️ <b>Расширение риска:</b> +%.8g на единицу от текущего SL. Подтверди осознанно.", preview.RiskIncreasePerUnit)
		}
		_ = n.sendToChat(ctx, chatID, formatDemoPositionHTML(preview.Position)+
			fmt.Sprintf("\n\n<b>Новый SL:</b> <code>%.8g</code>\n<b>Новый TP:</b> <code>%.8g</code>%s\n\nПодтвердить?", action.stopLoss, action.takeProfit, warning),
			confirmKeyboard(confirm))
		return
	}
	percent := 100.0
	if action.kind == "c25" {
		percent = 25
	} else if action.kind == "c50" {
		percent = 50
	}
	confirm := n.newPositionAction(chatID, position.Symbol, "apply-"+action.kind, 0, 0)
	_ = n.sendToChat(ctx, chatID, formatDemoPositionHTML(position)+
		fmt.Sprintf("\n\n⚠️ <b>Reduce-only закрытие %.0f%%</b>. Bybit будет повторно проверен перед отправкой.\n\nПодтвердить?", percent),
		confirmKeyboard(confirm))
}

func confirmKeyboard(confirm string) map[string]interface{} {
	return map[string]interface{}{"inline_keyboard": [][]map[string]string{
		{{"text": "✅ Подтвердить", "callback_data": confirm}, {"text": "✖️ Отмена", "callback_data": panelCallback("m")}},
	}}
}

func (n *Notifier) executePositionAction(chatID int64, action positionAction) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if n.demoTrader == nil {
		return
	}
	var text string
	var err error
	switch action.kind {
	case "apply-protect":
		var result execution.ProtectionPreview
		result, err = n.demoTrader.UpdateProtection(ctx, action.symbol, action.stopLoss, action.takeProfit)
		if err == nil {
			text = "✅ SL/TP обновлены и сверены с Bybit.\n\n" + formatDemoPositionHTML(result.Position)
		}
	case "apply-c25", "apply-c50", "apply-call":
		quantity := 0.0
		if action.kind != "apply-call" {
			position, readErr := n.demoTrader.DemoPosition(ctx, action.symbol)
			if readErr != nil {
				err = readErr
			} else {
				fraction := 0.25
				if action.kind == "apply-c50" {
					fraction = 0.5
				}
				quantity = position.Size * fraction
			}
		}
		if err == nil {
			var result execution.CloseResult
			result, err = n.demoTrader.ClosePosition(ctx, action.symbol, quantity)
			if err == nil {
				text = fmt.Sprintf("✅ Reduce-only close принят и сверён. Closed: <code>%.8g</code>, remaining: <code>%.8g</code>.\n\n<i>Reconciliation pending: агрегированные профили обновятся после следующей сверки.</i>", result.ClosedQuantity, result.RemainingSize)
			}
		}
	default:
		err = fmt.Errorf("unknown position action")
	}
	if err != nil {
		text = "❌ Действие не подтверждено Bybit: <code>" + err.Error() + "</code>\n\n<i>Reconciliation pending.</i>"
	}
	_ = n.sendToChat(ctx, chatID, text, panelKeyboard())
}

func (n *Notifier) requestManualProtection(chatID int64, symbol string, stopLoss, takeProfit float64) {
	if !n.isTerminalOperator(chatID) {
		n.sendControlDenied(context.Background(), chatID)
		return
	}
	if strings.TrimSpace(symbol) == "" || math.IsNaN(stopLoss) || math.IsNaN(takeProfit) || math.IsInf(stopLoss, 0) || math.IsInf(takeProfit, 0) {
		_ = n.sendToChat(context.Background(), chatID, "Использование: <code>/position BTCUSDT 95000 105000</code>", nil)
		return
	}
	go n.preparePositionAction(chatID, positionAction{chatID: chatID, symbol: strings.ToUpper(symbol), kind: "manual", stopLoss: stopLoss, takeProfit: takeProfit})
}

func (n *Notifier) handleManualPositionCommand(chatID int64, command string) {
	fields := strings.Fields(command)
	if len(fields) != 4 {
		_ = n.sendToChat(context.Background(), chatID, "Использование: <code>/position BTCUSDT 95000 105000</code>\n\nКоманда создаёт отдельное подтверждение после чтения Bybit.", nil)
		return
	}
	stopLoss, stopErr := strconv.ParseFloat(fields[2], 64)
	takeProfit, takeErr := strconv.ParseFloat(fields[3], 64)
	if stopErr != nil || takeErr != nil {
		_ = n.sendToChat(context.Background(), chatID, "SL и TP должны быть числами. Использование: <code>/position BTCUSDT 95000 105000</code>", nil)
		return
	}
	n.requestManualProtection(chatID, fields[1], stopLoss, takeProfit)
}

package traders

import (
	"fmt"
	"sort"
	"strings"
)

// TraderView bundles profile + stats + derived metrics for UI.
type TraderView struct {
	Profile Profile
	Stats   Stats
	WinRate float64
	ROI     float64
	Rank    int
}

// OverallSummary aggregates all virtual traders.
type OverallSummary struct {
	TotalTrades    int
	TotalClosed    int
	TotalOpen      int
	TotalWins      int
	TotalLosses    int
	TotalPnL       float64
	CombinedEquity float64
	CombinedROI    float64
	OverallWR      float64
	BestTrader     string
	BestROI        float64
}

// PanelPosition is the compact, read-only position projection shown in the
// Telegram terminal. Position-changing controls deliberately live elsewhere.
type PanelPosition struct {
	ProfileID   string
	ProfileName string
	Emoji       string
	Entry       HistoryEntry
}

// BuildPanelPositions returns only current positions in newest-first order.
func BuildPanelPositions(profiles []Profile, histories map[string][]HistoryEntry) []PanelPosition {
	var positions []PanelPosition
	for _, profile := range profiles {
		for _, entry := range histories[profile.ID] {
			if entry.Unrealized {
				positions = append(positions, PanelPosition{
					ProfileID: profile.ID, ProfileName: profile.Name, Emoji: profile.Emoji, Entry: entry,
				})
			}
		}
	}
	sort.Slice(positions, func(i, j int) bool {
		return positions[i].Entry.OpenedAt.After(positions[j].Entry.OpenedAt)
	})
	return positions
}

func FormatPanelPositionHTML(position PanelPosition) string {
	entry := position.Entry
	var b strings.Builder
	fmt.Fprintf(&b, "%s <b>%s · %s %s</b>\n", position.Emoji, position.ProfileName, entry.Symbol, entry.Side)
	fmt.Fprintf(&b, "Entry: <code>%.8g</code> → mark: <code>%.8g</code>\n", entry.Entry, entry.MarkPrice)
	pnl := 0.0
	if entry.PnL != nil {
		pnl = *entry.PnL
	}
	indicator := "⚪"
	if pnl > 0 {
		indicator = "🟢"
	} else if pnl < 0 {
		indicator = "🔴"
	}
	fmt.Fprintf(&b, "%s <b>Mark PnL: %+.2f USDT</b>\n", indicator, pnl)
	if entry.StopLoss > 0 || entry.TakeProfit > 0 {
		fmt.Fprintf(&b, "Защита: SL <code>%.8g</code> · TP <code>%.8g</code>\n", entry.StopLoss, entry.TakeProfit)
	} else {
		b.WriteString("Защита: <i>нет данных в журнале</i>\n")
	}
	b.WriteString("<i>Оценка по mark; realised PnL подтверждается после reconciliation.</i>")
	return b.String()
}

func BuildViews(profiles []Profile, stats []Stats, equityPerTrader float64) []TraderView {
	statMap := make(map[string]Stats, len(stats))
	for _, s := range stats {
		statMap[s.ProfileID] = s
	}
	views := make([]TraderView, 0, len(profiles))
	for _, p := range profiles {
		s := statMap[p.ID]
		eq := equityPerTrader
		if eq <= 0 {
			eq = 10_000
		}
		views = append(views, TraderView{
			Profile: p,
			Stats:   s,
			WinRate: winRate(s),
			ROI:     roi(s.TotalPnL, eq),
		})
	}
	sort.Slice(views, func(i, j int) bool {
		return views[i].ROI > views[j].ROI
	})
	for i := range views {
		views[i].Rank = i + 1
	}
	return views
}

func BuildOverall(profiles []Profile, stats []Stats, equityPerTrader float64) OverallSummary {
	var o OverallSummary
	if equityPerTrader <= 0 {
		equityPerTrader = 10_000
	}
	o.CombinedEquity = equityPerTrader * float64(len(profiles))
	statMap := make(map[string]Stats)
	for _, s := range stats {
		statMap[s.ProfileID] = s
	}
	bestROI := -1e18
	for _, p := range profiles {
		s := statMap[p.ID]
		o.TotalTrades += s.TradesTaken
		o.TotalOpen += s.Open
		o.TotalWins += s.Wins
		o.TotalLosses += s.Losses
		o.TotalPnL += s.TotalPnL
		r := roi(s.TotalPnL, equityPerTrader)
		if r > bestROI {
			bestROI = r
			o.BestROI = r
			o.BestTrader = p.Name
		}
	}
	o.TotalClosed = o.TotalWins + o.TotalLosses
	if o.TotalClosed > 0 {
		o.OverallWR = float64(o.TotalWins) / float64(o.TotalClosed) * 100
	}
	o.CombinedROI = roi(o.TotalPnL, o.CombinedEquity)
	return o
}

func roi(pnl, equity float64) float64 {
	if equity <= 0 {
		return 0
	}
	return pnl / equity * 100
}

func FormatDashboardHTML(views []TraderView, overall OverallSummary, demoLive bool) string {
	var b strings.Builder
	b.WriteString("👥 <b>Панель трейдеров</b>\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━\n\n")
	if demoLive {
		b.WriteString("🏦 <b>Bybit Demo autotrade ON</b> — только профили режима Demo aggregate формируют один ордер на бирже. Paper/shadow профили остаются виртуальными. Принятие заявки не означает fill; итоговый PnL Demo появляется после сверки закрытия с Bybit.\n\n")
	} else {
		b.WriteString("📝 <b>Virtual paper mode</b> — позиции и PnL являются симуляцией по market marks.\n\n")
	}

	b.WriteString("📊 <b>Общая статистика</b>\n")
	fmt.Fprintf(&b, "Депозит (virtual): <b>$%.0f</b> × %d\n", overall.CombinedEquity/float64(max(len(views), 1)), max(len(views), 1))
	fmt.Fprintf(&b, "Всего сделок: <b>%d</b> | Open: %d | Closed: %d\n", overall.TotalTrades, overall.TotalOpen, overall.TotalClosed)
	fmt.Fprintf(&b, "W/L: <b>%d/%d</b> | WR: <b>%.1f%%</b>\n", overall.TotalWins, overall.TotalLosses, overall.OverallWR)
	fmt.Fprintf(&b, "PnL по профилям: <b>%+.2f USDT</b>\n", overall.TotalPnL)
	fmt.Fprintf(&b, "Общий ROI: <b>%+.2f%%</b>\n", overall.CombinedROI)
	if overall.BestTrader != "" {
		fmt.Fprintf(&b, "🏆 Лидер: <b>%s</b> (ROI %+.2f%%)\n", overall.BestTrader, overall.BestROI)
	}

	b.WriteString("\n🏁 <b>Рейтинг по ROI</b>\n")
	for _, v := range views {
		medal := rankMedal(v.Rank)
		fmt.Fprintf(&b, "%s %s <b>%s</b>\n", medal, v.Profile.Emoji, v.Profile.Name)
		fmt.Fprintf(&b, "   Режим: %s\n", profileExecutionModeLabel(v.Profile, demoLive))
		fmt.Fprintf(&b, "   Сделок: %d | WR: %.0f%% | PnL: %+.2f | ROI: <b>%+.2f%%</b>\n",
			v.Stats.TradesTaken, v.WinRate, v.Stats.TotalPnL, v.ROI)
	}

	b.WriteString("\n<i>Детали:</i> /trader саша · катя · олег · /history миша")
	return b.String()
}

func FormatTraderDetailHTML(p Profile, s Stats, equity float64, demoLive bool, history []HistoryEntry) string {
	if equity <= 0 {
		equity = 10_000
	}
	wr := winRate(s)
	r := roi(s.TotalPnL, equity)
	var b strings.Builder
	fmt.Fprintf(&b, "%s <b>%s</b>\n", p.Emoji, p.Name)
	b.WriteString("━━━━━━━━━━━━━━━━━━━━\n")
	fmt.Fprintf(&b, "<i>%s</i>\n\n", p.Description)
	fmt.Fprintf(&b, "Режим исполнения: <b>%s</b>\n\n", profileExecutionModeLabel(p, demoLive))

	b.WriteString("<b>📋 Правила</b>\n")
	fmt.Fprintf(&b, "• Min score: <b>%d</b>", p.MinScore)
	if p.MaxScore > 0 {
		fmt.Fprintf(&b, " (max %d)", p.MaxScore)
	}
	b.WriteByte('\n')
	fmt.Fprintf(&b, "• Min vol 1m: <b>$%.0f</b>\n", p.MinVol1mUSDT)
	fmt.Fprintf(&b, "• Триггеры: ≥%d | Fade: %s", p.MinTriggers, boolRu(p.AllowFade))
	if p.MomentumOnly {
		b.WriteString(" | <b>Momentum CONFIRM/HOT</b>")
	}
	if p.FadeOnly {
		b.WriteString(" | <b>Только FADE</b>")
	}
	if p.Strategy == "tape_sync" {
		fmt.Fprintf(&b, " | <b>%s</b>", formatTapeStrategyRu())
		fmt.Fprintf(&b, "\n• Tape confluence: ≥<b>%d</b> индикаторов", p.MinTapePoints)
		if p.AdaptiveLearn {
			b.WriteString(" | 🧠 adaptive")
		}
		if p.MaxNotionalUSDT > 0 {
			fmt.Fprintf(&b, " | Max size: <b>$%.0f</b>", p.MaxNotionalUSDT)
		}
	}
	if p.Strategy == "carry_arbitrage" {
		b.WriteString(" | <b>Spot↔Perp carry</b>")
		if p.EquityUSDT > 0 {
			fmt.Fprintf(&b, "\n• Депозит профиля: <b>$%.0f</b>", p.EquityUSDT)
		}
	}
	if p.Strategy == "indicator_mtf" {
		b.WriteString(" | <b>5 индикаторов · 5m/15m</b>")
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "• Плечо до: <b>%dx</b> | Max open: %d\n\n", p.LeverageMax, p.MaxOpen)

	b.WriteString("<b>📈 Статистика</b>\n")
	fmt.Fprintf(&b, "Virtual депозит: <b>$%.0f</b>\n", equity)
	fmt.Fprintf(&b, "Взял сделок: <b>%d</b> | Пропустил: %d\n", s.TradesTaken, s.TradesSkip)
	fmt.Fprintf(&b, "Закрыто: %d | Open: <b>%d</b>\n", s.Closed(), s.Open)
	fmt.Fprintf(&b, "Wins: <b>%d</b> | Losses: <b>%d</b> | WR: <b>%.1f%%</b>\n", s.Wins, s.Losses, wr)
	if demoLive && p.ExecutionMode != ExecutionPaper {
		fmt.Fprintf(&b, "Bybit-reconciled PnL: <b>%+.2f USDT</b>\n", s.TotalPnL)
	} else {
		fmt.Fprintf(&b, "Virtual realised PnL: <b>%+.2f USDT</b>\n", s.TotalPnL)
	}
	fmt.Fprintf(&b, "ROI: <b>%+.2f%%</b>\n", r)
	fmt.Fprintf(&b, "PF: <b>%.2f</b> | Avg R: <b>%+.2f</b> | Max DD: <b>%.2f USDT</b>\n",
		s.ProfitFactor(), s.AverageR, s.MaxDrawdown)
	if demoLive && p.ExecutionMode != ExecutionPaper {
		b.WriteString("🏦 <b>Bybit Demo:</b> aggregate-ордер на api-demo.bybit.com; результат распределён этому virtual-профилю\n")
	} else if p.ExecutionMode == ExecutionPaper {
		b.WriteString("📝 <b>Paper/shadow:</b> virtual stats и journal; этот профиль никогда не входит в Bybit Demo aggregate-ордер\n")
	}

	avgPerTrade := 0.0
	if s.Closed() > 0 {
		avgPerTrade = s.TotalPnL / float64(s.Closed())
	}
	fmt.Fprintf(&b, "Avg PnL/сделка: %+.2f USDT\n", avgPerTrade)
	b.WriteString("\n<b>🧾 История сделок</b>\n")
	if len(history) == 0 {
		b.WriteString("Пока нет сделок.\n")
	} else {
		for _, h := range history {
			b.WriteString(formatHistoryLine(h))
		}
	}
	return b.String()
}

func formatHistoryLine(h HistoryEntry) string {
	var b strings.Builder
	status := tradeStatusEmoji(h)
	fmt.Fprintf(&b, "%s <b>%s</b> %s · entry <code>%.6g</code>", status, h.Symbol, h.Side, h.Entry)
	if h.Unrealized && h.MarkPrice > 0 {
		fmt.Fprintf(&b, " → mark <code>%.6g</code>", h.MarkPrice)
	}
	if h.PnL != nil {
		fmt.Fprintf(&b, " · <b>%+.2f USDT</b>", *h.PnL)
	}
	if h.Score > 0 {
		fmt.Fprintf(&b, " · score %d", h.Score)
	}
	if h.Leverage > 0 {
		fmt.Fprintf(&b, " · %dx", h.Leverage)
	}
	if h.NotionalUSDT > 0 {
		fmt.Fprintf(&b, " · $%.0f", h.NotionalUSDT)
	}
	if h.RiskReward > 0 {
		fmt.Fprintf(&b, " · R:R 1:%.1f", h.RiskReward)
	}
	if h.SetupType != "" {
		fmt.Fprintf(&b, " · %s", h.SetupType)
	}
	if h.Duration > 0 {
		fmt.Fprintf(&b, " · ⏱ %s", FormatDuration(h.Duration))
	}
	if h.CloseReason != "" {
		fmt.Fprintf(&b, " · <i>%s</i>", h.CloseReason)
	}
	b.WriteByte('\n')
	return b.String()
}

func tradeStatusEmoji(h HistoryEntry) string {
	if h.Unrealized {
		return "🟡"
	}
	if h.PnL == nil {
		return "⚪"
	}
	if *h.PnL > 0 {
		return "✅"
	}
	if *h.PnL < 0 {
		return "❌"
	}
	return "⚪"
}

// FormatTradeDetailHTML renders a full trade card for Telegram drill-down.
func FormatTradeDetailHTML(profile Profile, entry HistoryEntry) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s <b>%s · %s %s</b>\n", profile.Emoji, profile.Name, entry.Symbol, entry.Side)
	b.WriteString("━━━━━━━━━━━━━━━━━━━━\n\n")
	if entry.SignalID != "" {
		fmt.Fprintf(&b, "Signal ID: <code>%s</code>\n", entry.SignalID)
	}
	if entry.SetupType != "" {
		fmt.Fprintf(&b, "Setup: <b>%s</b>", entry.SetupType)
		if entry.AlertType != "" {
			fmt.Fprintf(&b, " · %s", entry.AlertType)
		}
		b.WriteByte('\n')
	}
	fmt.Fprintf(&b, "Entry: <code>%.8g</code>\n", entry.Entry)
	if entry.StopLoss > 0 || entry.TakeProfit > 0 {
		fmt.Fprintf(&b, "SL: <code>%.8g</code> · TP: <code>%.8g</code>\n", entry.StopLoss, entry.TakeProfit)
	}
	if entry.Leverage > 0 {
		fmt.Fprintf(&b, "Плечо: <b>%dx</b>", entry.Leverage)
	}
	if entry.NotionalUSDT > 0 {
		fmt.Fprintf(&b, " · Size: <b>$%.2f</b>", entry.NotionalUSDT)
	}
	if entry.RiskUSDT > 0 {
		fmt.Fprintf(&b, " · Risk: <b>$%.2f</b>", entry.RiskUSDT)
	}
	if entry.RiskReward > 0 {
		fmt.Fprintf(&b, " · R:R <b>1:%.2f</b>", entry.RiskReward)
	}
	if entry.Leverage > 0 || entry.NotionalUSDT > 0 {
		b.WriteByte('\n')
	}
	if entry.Score > 0 {
		fmt.Fprintf(&b, "Score: <b>%d</b>\n", entry.Score)
	}
	if !entry.OpenedAt.IsZero() {
		fmt.Fprintf(&b, "Открыта: <code>%s</code>\n", entry.OpenedAt.UTC().Format("2006-01-02 15:04 UTC"))
	}
	if entry.ClosedAt != nil {
		fmt.Fprintf(&b, "Закрыта: <code>%s</code>\n", entry.ClosedAt.UTC().Format("2006-01-02 15:04 UTC"))
		if entry.Duration > 0 {
			fmt.Fprintf(&b, "Длительность: <b>%s</b>\n", FormatDuration(entry.Duration))
		}
	}
	if entry.Unrealized {
		fmt.Fprintf(&b, "Mark: <code>%.8g</code>\n", entry.MarkPrice)
	}
	if entry.PnL != nil {
		label := "Virtual PnL"
		if entry.Demo {
			label = "Bybit realised PnL"
		} else if entry.Unrealized {
			label = "Mark PnL"
		}
		fmt.Fprintf(&b, "\n<b>%s: %+.2f USDT</b>\n", label, *entry.PnL)
	}
	if entry.CloseReason != "" {
		fmt.Fprintf(&b, "Причина закрытия: <i>%s</i>\n", entry.CloseReason)
	}
	if len(entry.IndicatorTags) > 0 {
		b.WriteString("\n<b>📈 Индикаторы / carry</b>\n")
		for _, tag := range entry.IndicatorTags {
			fmt.Fprintf(&b, "• <code>%s</code>\n", tag)
		}
	}
	if entry.Mode != "" {
		fmt.Fprintf(&b, "\nРежим: <code>%s</code>", entry.Mode)
	}
	return b.String()
}

// TraderHistoryInlineKeyboard gives every current position its own compact
// status button. Telegram buttons cannot be styled, so green/red indicators
// are encoded with emoji and the precise mark PnL is shown in the callback.
func TraderHistoryInlineKeyboard(profileID string, history []HistoryEntry, offset, total int) map[string]interface{} {
	rows := make([][]map[string]string, 0, len(history)+2)
	for _, entry := range history {
		if entry.SignalID == "" {
			continue
		}
		pnl := 0.0
		if entry.PnL != nil {
			pnl = *entry.PnL
		}
		indicator := tradeStatusEmoji(entry)
		label := fmt.Sprintf("%s %s", indicator, entry.Symbol)
		if entry.PnL != nil {
			label = fmt.Sprintf("%s %s %+.1f", indicator, entry.Symbol, pnl)
		}
		callback := "p1:z:" + profileID + ":" + entry.SignalID
		if len(callback) > 64 {
			callback = "p1:x:" + profileID + ":" + entry.SignalID
		}
		if len(callback) > 64 {
			continue
		}
		rows = append(rows, []map[string]string{{"text": label, "callback_data": callback}})
	}
	const pageSize = 10
	if total > pageSize {
		page := offset/pageSize + 1
		pages := (total + pageSize - 1) / pageSize
		nav := make([]map[string]string, 0, 2)
		if offset > 0 {
			nav = append(nav, map[string]string{"text": "◀️ Ранее", "callback_data": fmt.Sprintf("p1:y:%s:%d", profileID, offset-pageSize)})
		}
		if offset+pageSize < total {
			nav = append(nav, map[string]string{"text": "Позже ▶️", "callback_data": fmt.Sprintf("p1:y:%s:%d", profileID, offset+pageSize)})
		}
		if len(nav) > 0 {
			rows = append(rows, nav)
		}
		rows = append(rows, []map[string]string{{"text": fmt.Sprintf("Страница %d/%d", page, pages), "callback_data": fmt.Sprintf("p1:y:%s:%d", profileID, offset)}})
	}
	if callback := fmt.Sprintf("p1:y:%s:0", profileID); len(callback) <= 64 {
		rows = append(rows, []map[string]string{{"text": "🧾 Вся история", "callback_data": callback}})
	}
	rows = append(rows, []map[string]string{{"text": "👥 Трейдеры", "callback_data": "p1:t"}})
	return map[string]interface{}{"inline_keyboard": rows}
}

func TradersInlineKeyboard() map[string]interface{} {
	return map[string]interface{}{
		"inline_keyboard": [][]map[string]string{
			{
				{"text": "🎯 Саша", "callback_data": "p1:d:sniper"},
				{"text": "⚖️ Дима", "callback_data": "p1:d:strategist"},
			},
			{
				{"text": "🔥 Ваня", "callback_data": "p1:d:agressor"},
				{"text": "⚡ Коля", "callback_data": "p1:d:kolya"},
			},
			{
				{"text": "🔬 Миша", "callback_data": "p1:d:misha"},
				{"text": "⚖️ Катя", "callback_data": "p1:d:katya"},
			},
			{
				{"text": "📊 Олег", "callback_data": "p1:d:oleg"},
				{"text": "📈 Общий ROI", "callback_data": "p1:t"},
			},
		},
	}
}

func rankMedal(rank int) string {
	switch rank {
	case 1:
		return "🥇"
	case 2:
		return "🥈"
	case 3:
		return "🥉"
	default:
		return fmt.Sprintf("%d.", rank)
	}
}

func boolRu(v bool) string {
	if v {
		return "да"
	}
	return "нет"
}

func profileExecutionModeLabel(p Profile, demoLive bool) string {
	if p.ExecutionMode == ExecutionPaper {
		return "📝 PAPER / SHADOW (без Bybit)"
	}
	if demoLive {
		return "🏦 BYBIT DEMO aggregate"
	}
	return "📝 PAPER (Demo недоступен)"
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func profileAliases() map[string]string {
	return map[string]string{
		"sniper": "sniper", "саша": "sniper", "sasha": "sniper", "снайпер": "sniper",
		"strategist": "strategist", "дима": "strategist", "dima": "strategist",
		"стратег": "strategist", "balanced": "strategist",
		"agressor": "agressor", "ваня": "agressor", "vanya": "agressor",
		"агрессор": "agressor", "scalper": "agressor",
		"kolya": "kolya", "коля": "kolya", "pulse": "kolya", "пульс": "kolya",
		"misha": "misha", "миша": "misha", "tape": "misha", "лента": "misha", "рентген": "misha",
		"katya": "katya", "катя": "katya", "carry": "katya", "арбитраж": "katya",
		"oleg": "oleg", "олег": "oleg", "indicators": "oleg", "индикаторы": "oleg",
	}
}

func ResolveProfileID(input string) string {
	key := strings.ToLower(strings.TrimSpace(input))
	if id, ok := profileAliases()[key]; ok {
		return id
	}
	return key
}

func winRate(s Stats) float64 {
	total := s.Wins + s.Losses
	if total == 0 {
		return 0
	}
	return float64(s.Wins) / float64(total) * 100
}

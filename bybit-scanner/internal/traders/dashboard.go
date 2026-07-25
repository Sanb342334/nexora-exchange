package traders

import (
	"fmt"
	"sort"
	"strings"
)

// TraderView bundles profile + stats + derived metrics for UI.
type TraderView struct {
	Profile       Profile
	Stats         Stats
	WinRate       float64
	ROI           float64
	Rank          int
}

// OverallSummary aggregates all virtual traders.
type OverallSummary struct {
	TotalTrades   int
	TotalClosed   int
	TotalOpen     int
	TotalWins     int
	TotalLosses   int
	TotalPnL      float64
	CombinedEquity float64
	CombinedROI   float64
	OverallWR     float64
	BestTrader    string
	BestROI       float64
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
		b.WriteString("🏦 <b>Bybit Demo autotrade ON</b> — ордера на бирже автоматически\n\n")
	}

	b.WriteString("📊 <b>Общая статистика</b>\n")
	fmt.Fprintf(&b, "Депозит (virtual): <b>$%.0f</b> × %d\n", overall.CombinedEquity/float64(max(len(views), 1)), max(len(views), 1))
	fmt.Fprintf(&b, "Всего сделок: <b>%d</b> | Open: %d | Closed: %d\n", overall.TotalTrades, overall.TotalOpen, overall.TotalClosed)
	fmt.Fprintf(&b, "W/L: <b>%d/%d</b> | WR: <b>%.1f%%</b>\n", overall.TotalWins, overall.TotalLosses, overall.OverallWR)
	fmt.Fprintf(&b, "Общий PnL: <b>%+.2f USDT</b>\n", overall.TotalPnL)
	fmt.Fprintf(&b, "Общий ROI: <b>%+.2f%%</b>\n", overall.CombinedROI)
	if overall.BestTrader != "" {
		fmt.Fprintf(&b, "🏆 Лидер: <b>%s</b> (ROI %+.2f%%)\n", overall.BestTrader, overall.BestROI)
	}

	b.WriteString("\n🏁 <b>Рейтинг по ROI</b>\n")
	for _, v := range views {
		medal := rankMedal(v.Rank)
		fmt.Fprintf(&b, "%s %s <b>%s</b>\n", medal, v.Profile.Emoji, v.Profile.Name)
		fmt.Fprintf(&b, "   Сделок: %d | WR: %.0f%% | PnL: %+.2f | ROI: <b>%+.2f%%</b>\n",
			v.Stats.TradesTaken, v.WinRate, v.Stats.TotalPnL, v.ROI)
	}

	b.WriteString("\n<i>Детали:</i> /trader саша · дима · ваня · коля · миша")
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
		if p.MaxNotionalUSDT > 0 {
			fmt.Fprintf(&b, " | Max size: <b>$%.0f</b>", p.MaxNotionalUSDT)
		}
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "• Плечо до: <b>%dx</b> | Max open: %d\n\n", p.LeverageMax, p.MaxOpen)

	b.WriteString("<b>📈 Статистика</b>\n")
	fmt.Fprintf(&b, "Virtual депозит: <b>$%.0f</b>\n", equity)
	fmt.Fprintf(&b, "Взял сделок: <b>%d</b> | Пропустил: %d\n", s.TradesTaken, s.TradesSkip)
	fmt.Fprintf(&b, "Закрыто: %d | Open: <b>%d</b>\n", s.Closed(), s.Open)
	fmt.Fprintf(&b, "Wins: <b>%d</b> | Losses: <b>%d</b> | WR: <b>%.1f%%</b>\n", s.Wins, s.Losses, wr)
	fmt.Fprintf(&b, "Paper PnL: <b>%+.2f USDT</b>\n", s.TotalPnL)
	fmt.Fprintf(&b, "ROI: <b>%+.2f%%</b>\n", r)
	if demoLive {
		b.WriteString("🏦 <b>Bybit Demo:</b> ордера автоматически на api-demo.bybit.com\n")
	}

	avgPerTrade := 0.0
	if s.Closed() > 0 {
		avgPerTrade = s.TotalPnL / float64(s.Closed())
	}
	fmt.Fprintf(&b, "Avg PnL/сделка: %+.2f USDT\n", avgPerTrade)
	b.WriteString("\n<b>🧾 Последние сделки</b>\n")
	if len(history) == 0 {
		b.WriteString("Пока нет сделок.\n")
	} else {
		for _, h := range history {
			state := "🟡 OPEN"
			if h.PnL != nil {
				state = fmt.Sprintf("%+.2f USDT", *h.PnL)
				if *h.PnL > 0 {
					state = "✅ " + state
				} else if *h.PnL < 0 {
					state = "❌ " + state
				}
			}
			fmt.Fprintf(&b, "• <b>%s</b> %s | %.6g | %s", h.Symbol, h.Side, h.Entry, state)
			if h.CloseReason != "" {
				fmt.Fprintf(&b, " (%s)", h.CloseReason)
			}
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func TradersInlineKeyboard() map[string]interface{} {
	return map[string]interface{}{
		"inline_keyboard": [][]map[string]string{
			{
				{"text": "🎯 Саша", "callback_data": "trader:sniper"},
				{"text": "⚖️ Дима", "callback_data": "trader:strategist"},
			},
			{
				{"text": "🔥 Ваня", "callback_data": "trader:agressor"},
				{"text": "⚡ Коля", "callback_data": "trader:kolya"},
			},
			{
				{"text": "🔬 Миша", "callback_data": "trader:misha"},
				{"text": "📊 Общий ROI", "callback_data": "traders:overall"},
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

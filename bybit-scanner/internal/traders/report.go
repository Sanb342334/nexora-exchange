package traders

import (
	"fmt"
	"strings"
)

// FormatTraderReportHTML renders a detailed performance report for one trader.
func FormatTraderReportHTML(p Profile, s Stats, equity float64, demoLive bool, history []HistoryEntry) string {
	if equity <= 0 {
		equity = 10_000
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s <b>Отчёт · %s</b>\n", p.Emoji, p.Name)
	b.WriteString("━━━━━━━━━━━━━━━━━━━━\n\n")

	closed := s.Closed()
	wr := winRate(s)
	roiPct := roi(s.TotalPnL, equity)
	fmt.Fprintf(&b, "<b>Сводка</b>\n")
	fmt.Fprintf(&b, "Депозит: <b>$%.0f</b> · Режим: <b>%s</b>\n", equity, profileExecutionModeLabel(p, demoLive))
	fmt.Fprintf(&b, "Сделок: <b>%d</b> (open %d) · Skip: %d\n", s.TradesTaken, s.Open, s.TradesSkip)
	fmt.Fprintf(&b, "W/L: <b>%d/%d</b> · WR: <b>%.1f%%</b>\n", s.Wins, s.Losses, wr)
	fmt.Fprintf(&b, "PnL: <b>%+.2f USDT</b> · ROI: <b>%+.2f%%</b>\n", s.TotalPnL, roiPct)
	fmt.Fprintf(&b, "PF: <b>%.2f</b> · Avg R: <b>%+.2f</b> · Max DD: <b>%.2f</b>\n", s.ProfitFactor(), s.AverageR, s.MaxDrawdown)
	if closed > 0 {
		fmt.Fprintf(&b, "Avg/сделка: <b>%+.2f USDT</b>\n", s.TotalPnL/float64(closed))
	}
	b.WriteByte('\n')

	openN, closedN := 0, 0
	for _, h := range history {
		if h.Unrealized {
			openN++
		} else if h.ClosedAt != nil {
			closedN++
		}
	}
	fmt.Fprintf(&b, "<b>📋 Сделки (%d)</b>\n", len(history))
	if len(history) == 0 {
		b.WriteString("Нет записей в журнале.\n")
		return b.String()
	}
	for i, h := range history {
		if i >= 25 {
			fmt.Fprintf(&b, "\n<i>… ещё %d сделок — /history %s</i>\n", len(history)-25, p.ID)
			break
		}
		b.WriteString(formatDetailedTradeBlock(h, i+1))
	}
	return b.String()
}

func formatDetailedTradeBlock(h HistoryEntry, num int) string {
	var b strings.Builder
	status := "OPEN"
	if h.Unrealized {
		status = "OPEN (mark)"
	} else if h.ClosedAt != nil {
		status = "CLOSED"
	}
	fmt.Fprintf(&b, "\n<b>#%d %s · %s %s</b> [%s]\n", num, h.Symbol, h.Side, statusLabel(h), status)
	fmt.Fprintf(&b, "Entry: <code>%.8g</code>", h.Entry)
	if h.ExitPrice > 0 {
		fmt.Fprintf(&b, " → Exit: <code>%.8g</code>", h.ExitPrice)
	} else if h.Unrealized && h.MarkPrice > 0 {
		fmt.Fprintf(&b, " → Mark: <code>%.8g</code>", h.MarkPrice)
	}
	b.WriteByte('\n')
	if h.StopLoss > 0 || h.TakeProfit > 0 {
		fmt.Fprintf(&b, "SL <code>%.8g</code> · TP <code>%.8g</code>\n", h.StopLoss, h.TakeProfit)
	}
	if h.Leverage > 0 || h.NotionalUSDT > 0 || h.RiskUSDT > 0 {
		fmt.Fprintf(&b, "Size: $%.2f · Risk $%.2f · %dx · R:R 1:%.2f\n",
			h.NotionalUSDT, h.RiskUSDT, h.Leverage, h.RiskReward)
	}
	if h.Score > 0 || h.SetupType != "" {
		fmt.Fprintf(&b, "Score %d · %s", h.Score, h.SetupType)
		if h.AlertType != "" {
			fmt.Fprintf(&b, " / %s", h.AlertType)
		}
		b.WriteByte('\n')
	}
	if !h.OpenedAt.IsZero() {
		fmt.Fprintf(&b, "Открыта: <code>%s</code>\n", h.OpenedAt.UTC().Format("2006-01-02 15:04:05 UTC"))
	}
	if h.ClosedAt != nil {
		fmt.Fprintf(&b, "Закрыта: <code>%s</code>\n", h.ClosedAt.UTC().Format("2006-01-02 15:04:05 UTC"))
	}
	if h.Duration > 0 {
		fmt.Fprintf(&b, "Длительность: <b>%s</b>\n", FormatDuration(h.Duration))
	}
	if h.PnL != nil {
		label := "PnL"
		if h.Demo {
			label = "Bybit PnL"
		} else if h.Unrealized {
			label = "Mark PnL"
		}
		fmt.Fprintf(&b, "<b>%s: %+.2f USDT</b>", label, *h.PnL)
		if h.RiskUSDT > 0 && !h.Unrealized {
			fmt.Fprintf(&b, " · <b>%.2f R</b>", *h.PnL/h.RiskUSDT)
		}
		b.WriteByte('\n')
	}
	if h.CloseReason != "" {
		fmt.Fprintf(&b, "Причина: <i>%s</i>\n", h.CloseReason)
	}
	if h.OrderID != "" {
		fmt.Fprintf(&b, "Order: <code>%s</code>\n", h.OrderID)
	}
	if len(h.IndicatorTags) > 0 {
		fmt.Fprintf(&b, "Meta: %s\n", strings.Join(h.IndicatorTags, " · "))
	}
	return b.String()
}

func statusLabel(h HistoryEntry) string {
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

// FormatGlobalReportHTML aggregates all traders into one report.
func FormatGlobalReportHTML(views []TraderView, overall OverallSummary) string {
	var b strings.Builder
	b.WriteString("📊 <b>Общий отчёт по трейдерам</b>\n")
	b.WriteString("━━━━━━━━━━━━━━━━━━━━\n\n")
	fmt.Fprintf(&b, "Equity: <b>$%.0f</b> · PnL: <b>%+.2f USDT</b> · ROI: <b>%+.2f%%</b>\n",
		overall.CombinedEquity, overall.TotalPnL, overall.CombinedROI)
	fmt.Fprintf(&b, "Сделок: <b>%d</b> · Open: <b>%d</b> · WR: <b>%.1f%%</b>\n\n",
		overall.TotalClosed, overall.TotalOpen, overall.OverallWR)
	for _, v := range views {
		wr := winRate(v.Stats)
		fmt.Fprintf(&b, "%s <b>%s</b> — %d сделок · %+.2f USDT · WR %.1f%% · open %d\n",
			v.Profile.Emoji, v.Profile.Name, v.Stats.Closed(), v.Stats.TotalPnL, wr, v.Stats.Open)
	}
	b.WriteString("\n<i>/report миша · /report катя · /history олег</i>")
	return b.String()
}

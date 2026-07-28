package risk

import (
	"fmt"
	"strings"
	"time"

	"bybit-scanner/internal/analyzer"
)

type Manager struct {
	cfg   Config
	flags RuntimeFlags
	state *StateStore
}

func NewManager(cfg Config, flags RuntimeFlags) *Manager {
	ApplyDefaults(&cfg)
	return &Manager{
		cfg:   cfg,
		flags: flags,
		state: NewStateStore(flags.StatePath),
	}
}

func (m *Manager) Enabled() bool {
	return m.cfg.Enabled
}

func (m *Manager) Mode() TradingMode {
	return m.flags.Mode
}

func (m *Manager) Evaluate(sig analyzer.Signal, candles []analyzer.Candle, slippagePct float64) TradeRecommendation {
	rec := TradeRecommendation{
		Signal:    sig,
		Mode:      m.flags.Mode,
		Timestamp: sig.Timestamp,
	}
	if rec.Timestamp.IsZero() {
		rec.Timestamp = time.Now().UTC()
	}

	if !m.cfg.Enabled {
		rec.Verdict = VerdictApproved
		rec.Entry = sig.Price
		rec.StopLoss = sig.SuggestedSL
		rec.TakeProfit = sig.SuggestedTP
		rec.SLMethod = "LEGACY"
		rec.RiskReward = rrRatio(rec.Entry, rec.StopLoss, rec.TakeProfit)
		rec.SLDistancePct = slDistancePct(rec.Entry, rec.StopLoss)
		rec.TPDistancePct = tpDistancePct(rec.Entry, rec.TakeProfit)
		return rec
	}

	mode := m.flags.Mode
	equity := m.flags.Equity(mode, m.cfg.Account.LiveEquityUSDT)

	if mode == ModeLive {
		if m.cfg.Live.RequireExplicitEnable && !m.flags.LiveTradingEnabled {
			return rec.reject("live_trading_not_enabled")
		}
		if sig.Score < m.cfg.Live.MinScore {
			return rec.reject(fmt.Sprintf("live_min_score (%d < %d)", sig.Score, m.cfg.Live.MinScore))
		}
		if equity <= 0 {
			return rec.reject("live_equity_not_set")
		}
	}

	if m.flags.KillSwitch {
		if mode == ModeLive || !m.cfg.Demo.AllowOnKillSwitch {
			rec.Verdict = VerdictKillSwitch
			rec.RejectReasons = []string{"kill_switch_active"}
			return rec
		}
		rec.Warnings = append(rec.Warnings, "kill_switch_active_demo_only")
	}

	if m.state.DailyLossBreached(mode, equity, m.cfg.dailyLossLimit(mode)) {
		if mode == ModeLive || !m.cfg.Demo.AllowOnKillSwitch {
			return rec.reject("daily_loss_limit")
		}
		rec.Warnings = append(rec.Warnings, "daily_loss_limit_demo")
	}

	if m.state.ConsecutiveLossBreached(mode, m.cfg.maxConsecutiveLosses(mode)) {
		if mode == ModeLive {
			return rec.reject("consecutive_loss_cooldown")
		}
		rec.Warnings = append(rec.Warnings, "consecutive_loss_cooldown_demo")
	}

	rec.Side = resolveSide(sig)
	rec.Entry = applySlippage(sig.Price, rec.Side, slippagePct)

	stops := computeStops(m.cfg, rec.Side, rec.Entry, sig, candles)
	rec.StopLoss = stops.SL
	rec.TakeProfit = stops.TP
	rec.SLMethod = stops.SLMethod
	rec.SLDistancePct = slDistancePct(rec.Entry, rec.StopLoss)
	rec.TPDistancePct = tpDistancePct(rec.Entry, rec.TakeProfit)
	rec.RiskReward = rrRatio(rec.Entry, rec.StopLoss, rec.TakeProfit)

	if rec.SLDistancePct < m.cfg.Stops.MinSLDistancePct {
		return rec.reject("sl_too_tight")
	}

	setup := m.cfg.stopsForSetup(sig.SetupType)
	minRR := setup.MinRR
	if minRR <= 0 {
		minRR = m.cfg.Stops.MinRR
	}
	if rec.RiskReward < minRR {
		return rec.reject(fmt.Sprintf("min_rr_not_met (%.2f < %.2f)", rec.RiskReward, minRR))
	}

	rec.Leverage, rec.LeverageReason = recommendLeverage(m.cfg, sig.SetupType, sig.ATRPct, rec.Entry, rec.StopLoss)
	rec.RiskPct = riskBudgetPct(m.cfg, sig.Score, sig.VolumeRatio, sig.ATRPct)
	rec.RiskUSDT = equity * rec.RiskPct / 100
	rec.Qty, rec.NotionalUSDT, rec.MarginUSDT = sizeFromRisk(rec.Entry, rec.StopLoss, rec.Leverage, rec.RiskUSDT, equity, m.cfg.Sizing)

	if rec.NotionalUSDT <= 0 {
		return rec.reject("zero_position_size")
	}

	fillLiquidation(&rec)
	if rec.SLToLiqBuffer < m.cfg.Leverage.MinSLLiqBufferPct {
		return rec.reject(fmt.Sprintf("sl_liq_buffer (%.2f%% < %.2f%%)", rec.SLToLiqBuffer, m.cfg.Leverage.MinSLLiqBufferPct))
	}

	bucket := bucketForSymbol(sig.Symbol, m.cfg.Portfolio.CorrelationBuckets)
	pf := m.state.CheckPortfolio(m.cfg, mode, rec, equity)
	rec.OpenPositions = pf.openCount
	rec.MaxPositions = pf.maxOpen
	rec.Bucket = bucket
	rec.BucketSameSide = pf.bucketCount
	rec.BucketMax = pf.bucketMax

	if pf.verdict == VerdictRejected {
		rec.Verdict = VerdictRejected
		rec.RejectReasons = pf.reasons
		return rec
	}

	rec.Verdict = VerdictApproved
	if pf.verdict == VerdictReduced {
		rec.Verdict = VerdictReduced
		rec.NotionalUSDT *= 0.5
		rec.MarginUSDT *= 0.5
		rec.Qty *= 0.5
		rec.RiskUSDT *= 0.5
		rec.Warnings = append(rec.Warnings, pf.reasons...)
	}

	return rec
}

// RegisterExecuted is called only after the exchange confirms an order with
// protective stops. Evaluation itself must not reserve portfolio capacity.
func (m *Manager) RegisterExecuted(rec TradeRecommendation) {
	m.state.Register(rec, rec.Bucket)
}

func (m *Manager) CloseExecuted(rec TradeRecommendation, pnlUSDT float64) {
	m.state.Close(rec.Mode, rec.Signal.Symbol, rec.Side, pnlUSDT, 0)
}

func applySlippage(price float64, side Side, slippagePct float64) float64 {
	if slippagePct <= 0 {
		return price
	}
	slip := slippagePct / 100
	if side == SideLong {
		return price * (1 + slip)
	}
	return price * (1 - slip)
}

func (rec *TradeRecommendation) reject(reasons ...string) TradeRecommendation {
	rec.Verdict = VerdictRejected
	rec.RejectReasons = reasons
	return *rec
}

func FormatTelegramHTML(rec TradeRecommendation) string {
	sig := rec.Signal
	bybitURL := fmt.Sprintf("https://www.bybit.com/trade/usdt/%s", sig.Symbol)
	tvSymbol := strings.TrimSuffix(sig.Symbol, "USDT")
	tvURL := fmt.Sprintf("https://www.tradingview.com/chart/?symbol=BYBIT:%sUSDT.P", tvSymbol)

	decouple := "нет"
	if sig.BTCDecoupled {
		decouple = "да ✓"
	}

	modeBadge := ""
	switch rec.Mode {
	case ModeDemo:
		if rec.Verdict != VerdictRejected {
			modeBadge = " 📝 <b>[DEMO]</b>"
		}
	case ModeLive:
		modeBadge = " 🔴 <b>[LIVE]</b>"
	}

	testBadge := ""
	if sig.SetupType == "TEST_SIGNAL" {
		testBadge = " 🧪 <b>[ТЕСТ]</b>"
	}

	var b strings.Builder

	alertHead := alertTypeLabel(sig.AlertType, sig.TradeAction)
	fmt.Fprintf(&b, "%s <b>%s | SCORE %d/100</b>%s%s\n", alertHead, sig.Symbol, sig.Score, modeBadge, testBadge)
	fmt.Fprintf(&b, "━━━━━━━━━━━━━━━━━━━━\n")
	if sig.TradeAction != "" {
		fmt.Fprintf(&b, "↕️ <b>Action:</b> %s\n", sig.TradeAction)
	}
	fmt.Fprintf(&b, "📈 <b>Движение:</b> %s\n", sig.Movement)
	fmt.Fprintf(&b, "🧠 <b>Сетап:</b> %s\n", sig.SetupType)
	fmt.Fprintf(&b, "⏱ <b>Latency:</b> %.2f ms\n", sig.LatencyMs)
	if len(sig.Reasons) > 0 {
		fmt.Fprintf(&b, "\n<b>WHY:</b>\n")
		for _, r := range sig.Reasons {
			fmt.Fprintf(&b, "• %s\n", r)
		}
	}
	fmt.Fprintf(&b, "\n")

	fmt.Fprintf(&b, "📊 <b>Vol 1m:</b> $%.0f (x%.2f)\n", sig.Volume1m, sig.VolumeRatio)
	fmt.Fprintf(&b, "🔥 <b>OI 3m:</b> %+.2f%%\n", sig.OIChange3m)
	fmt.Fprintf(&b, "💵 <b>Цена:</b> $%.6g (%+.2f%% 1m)\n", sig.Price, sig.PriceChange1m)
	fmt.Fprintf(&b, "⚡ <b>Funding:</b> %.4f%%\n", sig.FundingRate)
	fmt.Fprintf(&b, "⚖️ <b>L/S Ratio:</b> %.2f\n", sig.LongShortRatio)
	fmt.Fprintf(&b, "📶 <b>Orderflow Δ:</b> $%.0f\n", sig.TradeDelta1m)
	fmt.Fprintf(&b, "💥 <b>Liquidations 1m:</b> $%.0f\n", sig.Liquidation1m)
	fmt.Fprintf(&b, "🔗 <b>BTC decouple:</b> %s (BTC 5m: %+.2f%%)\n", decouple, sig.BTCChange5m)
	fmt.Fprintf(&b, "📏 <b>Spread:</b> %.3f%% | ATR: %.2f%%\n\n", sig.SpreadPct, sig.ATRPct)

	if rec.Approved() {
		fmt.Fprintf(&b, "━━━━━━━━ <b>CONFIRMED RISK PLAN</b> ━━━━━━━━\n")
		fmt.Fprintf(&b, "<i>Это план риска, а не подтверждение заявки или fill.</i>\n")
		fmt.Fprintf(&b, "↕️ <b>Side:</b> %s\n", rec.Side)
		fmt.Fprintf(&b, "🎯 <b>Entry:</b> $%.6g\n", rec.Entry)
		fmt.Fprintf(&b, "🛑 <b>SL:</b> $%.6g <i>[%s]</i> (%.2f%%)\n", rec.StopLoss, rec.SLMethod, rec.SLDistancePct)
		fmt.Fprintf(&b, "✅ <b>TP:</b> $%.6g (%.2f%%)\n", rec.TakeProfit, rec.TPDistancePct)
		fmt.Fprintf(&b, "⚙️ <b>Leverage:</b> %dx (%s)\n", rec.Leverage, rec.LeverageReason)
		fmt.Fprintf(&b, "💰 <b>Size:</b> $%.0f notional | margin $%.0f\n", rec.NotionalUSDT, rec.MarginUSDT)
		fmt.Fprintf(&b, "🎲 <b>Risk:</b> $%.2f (%.2f%% equity)\n", rec.RiskUSDT, rec.RiskPct)
		fmt.Fprintf(&b, "📐 <b>R:R:</b> 1:%.1f\n", rec.RiskReward)
		fmt.Fprintf(&b, "☠️ <b>Liq:</b> $%.6g (%.1f%% from entry)\n", rec.LiqPrice, rec.LiqDistancePct)
		fmt.Fprintf(&b, "   Buffer SL→Liq: %.2f%% ✓\n", rec.SLToLiqBuffer)
		fmt.Fprintf(&b, "📦 <b>Portfolio:</b> %d/%d | %s bucket %d/%d %s\n\n",
			rec.OpenPositions+1, rec.MaxPositions, rec.Bucket, rec.BucketSameSide+1, rec.BucketMax, rec.Side)
		if len(rec.Warnings) > 0 {
			fmt.Fprintf(&b, "⚠️ <b>Warnings:</b> %s\n\n", strings.Join(rec.Warnings, "; "))
		}
		if rec.Verdict == VerdictReduced {
			fmt.Fprintf(&b, "⚠️ <b>Size reduced</b> by portfolio limits\n\n")
		}
	} else {
		fmt.Fprintf(&b, "🎯 <b>Entry:</b> $%.6g\n", sig.Price)
		fmt.Fprintf(&b, "🛑 <b>SL (ATR):</b> $%.6g\n", sig.SuggestedSL)
		fmt.Fprintf(&b, "✅ <b>TP (ATR):</b> $%.6g\n\n", sig.SuggestedTP)
	}

	triggers := make([]string, len(sig.Triggers))
	for i, t := range sig.Triggers {
		triggers[i] = string(t)
	}
	fmt.Fprintf(&b, "🏷 <b>Триггеры:</b> %s\n\n", strings.Join(triggers, ", "))
	fmt.Fprintf(&b, "🔗 <a href=\"%s\">Bybit</a> | <a href=\"%s\">TradingView</a>", bybitURL, tvURL)
	return b.String()
}

func alertTypeLabel(alertType, action string) string {
	switch alertType {
	case "HOT":
		if action == "SHORT" {
			return "🔥"
		}
		return "🔥"
	case "CONFIRMED":
		if action == "SHORT" {
			return "🔴"
		}
		return "🟢"
	case "FADE":
		return "🔄"
	case "IMPULSE":
		return "⚡"
	default:
		return "🚀"
	}
}

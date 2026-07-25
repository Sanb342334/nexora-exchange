package traders

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/execution"
	"bybit-scanner/internal/risk"
)

type Result struct {
	Profile      Profile
	Rec          risk.TradeRecommendation
	Skipped      bool
	Reason       string
	DemoExecuted bool
	DemoOrderID  string
}

type runtimeProfile struct {
	Profile Profile
	Risk    *risk.Manager
	Stats   *StatsStore
	Journal *Journal
}

type approvedRecommendation struct {
	index int
	rec   risk.TradeRecommendation
}

type demoAllocation struct {
	index int
	rec   risk.TradeRecommendation
}

type Manager struct {
	mu              sync.RWMutex
	profiles        []runtimeProfile
	enabled         bool
	equityPerTrader float64
	demo            *execution.DemoTrader
	demoOrders      map[string][]demoAllocation
	reconciledOrders map[string]struct{}
}

func (m *Manager) SetDemoExecutor(d *execution.DemoTrader) {
	m.mu.Lock()
	m.demo = d
	m.mu.Unlock()
}

func (m *Manager) DemoAutotradeEnabled() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.demo != nil && m.demo.Enabled()
}

func NewManager(cfg *config.Config, baseRisk config.RiskConfig, flags risk.RuntimeFlags, logDir string) *Manager {
	yaml := cfg.Snapshot()
	profiles := MergeProfiles(yaml.Traders, baseRisk)

	equity := yaml.Traders.EquityPerTraderUSDT
	if equity <= 0 {
		n := len(profiles)
		if n <= 0 {
			n = 5
		}
		equity = flags.DemoEquityUSDT / float64(n)
	}
	if equity <= 0 {
		equity = 10_000
	}

	m := &Manager{
		enabled: yaml.Traders.Enabled, equityPerTrader: equity,
		demoOrders: make(map[string][]demoAllocation),
		reconciledOrders: make(map[string]struct{}),
	}
	if !m.enabled {
		m.enabled = true // default on with 5 traders
	}

	for _, p := range profiles {
		rc := risk.ConfigFromApp(baseRisk)
		rc.Leverage.Max = p.LeverageMax
		if rc.Leverage.Min > p.LeverageMax {
			rc.Leverage.Min = p.LeverageMax
		}
		rc.Account.AccountRiskPct *= p.RiskMult
		rc.Stops.MinRR = p.MinRR
		if p.MinSLDistancePct > 0 {
			rc.Stops.MinSLDistancePct = p.MinSLDistancePct
		}
		rc.Portfolio.MaxOpenPositions.Demo = p.MaxOpen
		rc.Portfolio.MaxOpenPositions.Live = minInt(p.MaxOpen, 4)
		rc.Live.MinScore = p.MinScore
		if p.MinSLLiqBuffer > 0 {
			rc.Leverage.MinSLLiqBufferPct = p.MinSLLiqBuffer
		}
		if p.MaxNotionalUSDT > 0 {
			rc.Sizing.MaxNotionalUSDT = p.MaxNotionalUSDT
		}

		pf := runtimeProfile{
			Profile: p,
			Risk:    risk.NewManager(rc, riskFlagsWithState(flags, logDir, p.ID)),
			Stats:   NewStatsStore(logDir, p.ID),
			Journal: NewJournal(logDir, p.ID),
		}
		m.profiles = append(m.profiles, pf)
	}
	return m
}

func riskFlagsWithState(flags risk.RuntimeFlags, logDir, profileID string) risk.RuntimeFlags {
	flags.StatePath = filepath.Join(logDir, "traders", profileID, "risk_state.json")
	return flags
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (m *Manager) Enabled() bool {
	return m.enabled && len(m.profiles) > 0
}

func (m *Manager) Process(sig analyzer.Signal, candles []analyzer.Candle, slippage float64) []Result {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var out []Result
	approvedBySide := make(map[risk.Side][]approvedRecommendation)

	for i, rp := range m.profiles {
		ok, reason := rp.Profile.Accepts(sig)
		if !ok {
			rp.Stats.RecordSkipReason(reason)
			out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: reason})
			continue
		}
		rec := rp.Risk.Evaluate(sig, candles, slippage)
		if !rec.Approved() {
			reason := strings.Join(rec.RejectReasons, ",")
			rp.Stats.RecordSkipReason(reason)
			out = append(out, Result{
				Profile: rp.Profile, Skipped: true,
				Reason: strings.Join(rec.RejectReasons, ","),
			})
			continue
		}

		approvedBySide[rec.Side] = append(approvedBySide[rec.Side], approvedRecommendation{index: i, rec: rec})
	}

	// A one-way Bybit position cannot safely represent simultaneous LONG and
	// SHORT decisions. Do not let profiles overwrite each other's leverage or
	// SL/TP; record an explicit conflict instead.
	if len(approvedBySide[risk.SideLong]) > 0 && len(approvedBySide[risk.SideShort]) > 0 {
		for _, group := range approvedBySide {
			for _, a := range group {
				rp := m.profiles[a.index]
				rp.Stats.RecordSkipReason("opposite_side_conflict")
				out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: "opposite_side_conflict"})
			}
		}
		return out
	}

	for _, group := range approvedBySide {
		if len(group) == 0 {
			continue
		}

		demoExecuted := false
		demoOrderID := ""
		if m.demo != nil && m.demo.Enabled() {
			aggregate := aggregateRecommendation(group)
			execCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			demoRes, err := m.demo.ExecuteTrade(execCtx, "aggregate", aggregate)
			cancel()
			if err != nil {
				for _, a := range group {
					rp := m.profiles[a.index]
					rp.Stats.RecordSkipReason("demo_exec:" + err.Error())
					out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: "demo_exec:" + err.Error()})
				}
				continue
			}
			demoExecuted = true
			demoOrderID = demoRes.OrderID
		}

		for _, a := range group {
			rp := m.profiles[a.index]
			rp.Risk.RegisterExecuted(a.rec)
			rp.Journal.Record(a.rec, rp.Profile.ID, demoOrderID)
			rp.Stats.RecordOpen(a.rec)
			out = append(out, Result{
				Profile: rp.Profile, Rec: a.rec,
				DemoExecuted: demoExecuted, DemoOrderID: demoOrderID,
			})
		}
		if demoExecuted && demoOrderID != "" {
			allocations := make([]demoAllocation, 0, len(group))
			for _, a := range group {
				allocations = append(allocations, demoAllocation{index: a.index, rec: a.rec})
			}
			m.demoOrders[demoOrderID] = allocations
		}
	}
	return out
}

// aggregateRecommendation makes one exchange order for agreeing profiles.
// It uses the lowest leverage and the most conservative shared exit levels.
func aggregateRecommendation(group []approvedRecommendation) risk.TradeRecommendation {
	out := group[0].rec
	out.Qty, out.NotionalUSDT, out.MarginUSDT, out.RiskUSDT = 0, 0, 0, 0
	for i, a := range group {
		r := a.rec
		out.Qty += r.Qty
		out.NotionalUSDT += r.NotionalUSDT
		out.MarginUSDT += r.MarginUSDT
		out.RiskUSDT += r.RiskUSDT
		if i == 0 || r.Leverage < out.Leverage {
			out.Leverage = r.Leverage
		}
		if out.Side == risk.SideLong {
			if r.StopLoss < out.StopLoss {
				out.StopLoss = r.StopLoss
			}
			if r.TakeProfit < out.TakeProfit {
				out.TakeProfit = r.TakeProfit
			}
		} else {
			if r.StopLoss > out.StopLoss {
				out.StopLoss = r.StopLoss
			}
			if r.TakeProfit > out.TakeProfit {
				out.TakeProfit = r.TakeProfit
			}
		}
	}
	out.LeverageReason = "aggregate_conservative"
	return out
}

func (m *Manager) UpdatePrice(symbol string, price float64) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.demo != nil && m.demo.Enabled() {
		return // Exchange closed-PnL is the only authoritative demo result.
	}
	for _, rp := range m.profiles {
		rp.Stats.CheckPrice(symbol, price)
	}
}

// ReconcileClosed distributes exchange-confirmed aggregate PnL to the
// contributing profiles by their intended risk share.
func (m *Manager) ReconcileClosed(closed []execution.ClosedPnL) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, trade := range closed {
		if _, done := m.reconciledOrders[trade.OrderID]; done {
			continue
		}
		allocations, ok := m.demoOrders[trade.OrderID]
		if !ok || len(allocations) == 0 {
			continue
		}
		totalRisk := 0.0
		for _, a := range allocations {
			totalRisk += a.rec.RiskUSDT
		}
		for _, a := range allocations {
			share := 1 / float64(len(allocations))
			if totalRisk > 0 {
				share = a.rec.RiskUSDT / totalRisk
			}
			pnl := trade.ClosedPnL * share
			rp := m.profiles[a.index]
			rp.Stats.RecordExchangeClose(pnl)
			rp.Risk.CloseExecuted(a.rec, pnl)
			rp.Journal.RecordClose(a.rec, rp.Profile.ID, trade.OrderID, pnl, trade.CloseReason, trade.UpdatedAt)
		}
		m.reconciledOrders[trade.OrderID] = struct{}{}
		delete(m.demoOrders, trade.OrderID)
	}
}

func (m *Manager) AllProfiles() []Profile {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Profile, len(m.profiles))
	for i, rp := range m.profiles {
		out[i] = rp.Profile
	}
	return out
}

func (m *Manager) Stats(profileID string) (Stats, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rp := range m.profiles {
		if rp.Profile.ID == profileID {
			return rp.Stats.Snapshot(), true
		}
	}
	return Stats{}, false
}

func (m *Manager) AllStats() []Stats {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Stats, 0, len(m.profiles))
	for _, rp := range m.profiles {
		out = append(out, rp.Stats.Snapshot())
	}
	return out
}

func (m *Manager) EquityPerTrader() float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.equityPerTrader
}

func (m *Manager) Dashboard() (views []TraderView, overall OverallSummary) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	profiles := make([]Profile, len(m.profiles))
	stats := make([]Stats, len(m.profiles))
	for i, rp := range m.profiles {
		profiles[i] = rp.Profile
		stats[i] = rp.Stats.Snapshot()
	}
	views = BuildViews(profiles, stats, m.equityPerTrader)
	overall = BuildOverall(profiles, stats, m.equityPerTrader)
	return views, overall
}

func (m *Manager) ProfileByID(id string) (Profile, Stats, bool) {
	id = ResolveProfileID(id)
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rp := range m.profiles {
		if rp.Profile.ID == id {
			return rp.Profile, rp.Stats.Snapshot(), true
		}
	}
	return Profile{}, Stats{}, false
}

func (m *Manager) History(profileID string, limit int) ([]HistoryEntry, bool) {
	profileID = ResolveProfileID(profileID)
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rp := range m.profiles {
		if rp.Profile.ID == profileID {
			return rp.Journal.Recent(limit), true
		}
	}
	return nil, false
}

func (m *Manager) WinRate(profileID string) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rp := range m.profiles {
		if rp.Profile.ID == profileID {
			return rp.Stats.WinRate()
		}
	}
	return 0
}

func FormatMultiTraderSignalHTML(results []Result) string {
	var b strings.Builder
	var primary *Result
	for i := range results {
		if !results[i].Skipped {
			if primary == nil || results[i].Profile.ID == "strategist" {
				primary = &results[i]
			}
		}
	}
	if primary == nil {
		return ""
	}
	rec := primary.Rec
	base := risk.FormatTelegramHTML(rec)
	b.WriteString(base)
	b.WriteString("\n\n👥 <b>Traders:</b>\n")
	for _, r := range results {
		if r.Skipped {
			fmt.Fprintf(&b, "%s %s — ⏭ skip (%s)\n", r.Profile.Emoji, r.Profile.Name, r.Reason)
		} else {
			extra := ""
			if r.Profile.Strategy == "tape_sync" {
				tape := readTape(r.Rec.Signal)
				extra = fmt.Sprintf(" | tape %d/9", tape.Points)
			}
			fmt.Fprintf(&b, "%s %s — ✅ IN | %dx | $%.0f | R:R 1:%.1f%s",
				r.Profile.Emoji, r.Profile.Name, r.Rec.Leverage, r.Rec.NotionalUSDT, r.Rec.RiskReward, extra)
			if r.DemoExecuted {
				b.WriteString(" | 🏦 DEMO")
			}
			b.WriteByte('\n')
		}
	}
	return b.String()
}

package traders

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
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
	Learner *AdaptiveLearner
}

type approvedRecommendation struct {
	index int
	rec   risk.TradeRecommendation
}

type demoAllocation struct {
	index int
	rec   risk.TradeRecommendation
}

type persistedDemoAllocation struct {
	ProfileID string                   `json:"profile_id"`
	Rec       risk.TradeRecommendation `json:"recommendation"`
}

type Manager struct {
	mu               sync.RWMutex
	profiles         []runtimeProfile
	enabled          bool
	equityPerTrader  float64
	carryMaxHold     time.Duration
	demo             *execution.DemoTrader
	accountRisk      *accountRiskLedger
	demoOrders       map[string][]demoAllocation
	reconciledOrders map[string]struct{}
	pendingPath      string
	reconciledPath   string
}

func (m *Manager) SetDemoExecutor(d *execution.DemoTrader) {
	m.mu.Lock()
	m.demo = d
	m.mu.Unlock()
}

// RestoreDemoPositions rehydrates only allocations persisted by this manager.
// It never adopts unrelated exchange positions after a process restart.
func (m *Manager) RestoreDemoPositions() {
	m.mu.RLock()
	demo := m.demo
	positions := make([]execution.ManagedDemoPosition, 0, len(m.demoOrders))
	for orderID, allocations := range m.demoOrders {
		if len(allocations) == 0 {
			continue
		}
		rec := aggregateRecommendation(toApproved(allocations))
		positions = append(positions, execution.ManagedDemoPosition{
			OrderID: orderID, Symbol: rec.Signal.Symbol, Side: sideToBybit(rec.Side),
			EntryPrice: rec.Entry, OriginalStop: rec.StopLoss, OriginalTP: rec.TakeProfit,
		})
	}
	m.mu.RUnlock()
	if demo == nil {
		return
	}
	for _, position := range positions {
		demo.RegisterManagedPosition(position)
	}
}

func (m *Manager) DemoAutotradeEnabled() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.demo != nil && m.demo.Enabled()
}

func (m *Manager) SetAdaptiveExitPolicy(policy config.AdaptiveExitConfig) {
	m.mu.RLock()
	demo := m.demo
	m.mu.RUnlock()
	if demo != nil {
		demo.SetAdaptiveExitPolicy(policy)
	}
}

func NewManager(cfg *config.Config, baseRisk config.RiskConfig, flags risk.RuntimeFlags, logDir string) *Manager {
	yaml := cfg.Snapshot()
	profiles := MergeProfiles(yaml.Traders, baseRisk)
	accountConfig := risk.ConfigFromApp(baseRisk)

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
		carryMaxHold: time.Duration(yaml.Carry.MaxHoldingMinutes) * time.Minute,
		demoOrders:       make(map[string][]demoAllocation),
		reconciledOrders: make(map[string]struct{}),
		pendingPath:      filepath.Join(logDir, "traders", "pending_demo_orders.json"),
		reconciledPath:   filepath.Join(logDir, "traders", "reconciled_demo_orders.json"),
		accountRisk:      newAccountRiskLedger(accountConfig, flags),
	}
	if !m.enabled {
		m.enabled = true // default on with 5 traders
	}

	for _, p := range profiles {
		rc := accountConfig
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
		if p.EquityUSDT > 0 {
			rc.Account.DemoEquityUSDT = p.EquityUSDT
		}
		if p.MaxNotionalUSDT > 0 {
			rc.Sizing.MaxNotionalUSDT = p.MaxNotionalUSDT
		}
		if p.MaxTradesPerDay >= 50 {
			if rc.Portfolio.MaxSameBucketSameSide < 10 {
				rc.Portfolio.MaxSameBucketSameSide = 10
			}
			if rc.Portfolio.MaxTotalSameSide < p.MaxOpen {
				rc.Portfolio.MaxTotalSameSide = p.MaxOpen
			}
		}

		pf := runtimeProfile{
			Profile: p,
			Risk:    risk.NewManager(rc, riskFlagsWithState(flags, logDir, p.ID)),
			Stats:   NewStatsStore(logDir, p.ID),
			Journal: NewJournal(logDir, p.ID),
		}
		if p.AdaptiveLearn || p.MaxTradesPerDay > 0 {
			pf.Learner = NewAdaptiveLearner(logDir, p.ID, false, p.AdaptiveLearn, p.MaxTradesPerDay)
		}
		m.profiles = append(m.profiles, pf)
	}
	m.loadPending()
	m.loadReconciled()
	for orderID, allocations := range m.demoOrders {
		if len(allocations) > 0 {
			_ = m.accountRisk.Reserve(orderID, aggregateRecommendation(toApproved(allocations)))
		}
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
	// Processing can persist aggregate demo-order allocations. Use an
	// exclusive lock; an RLock around a map write races reconciliation and can
	// crash the process under concurrent market events.
	m.mu.Lock()
	defer m.mu.Unlock()

	var out []Result
	approvedBySide := make(map[risk.Side][]approvedRecommendation)

	for i, rp := range m.profiles {
		effective := rp.Profile
		if rp.Learner != nil {
			effective.MinTapePoints = rp.Learner.EffectiveMinTapePoints(rp.Profile.MinTapePoints)
			effective.MinScore = rp.Learner.EffectiveMinScore(rp.Profile.MinScore)
			if rp.Profile.MaxTradesPerDay > 0 && !rp.Learner.CanOpenToday() {
				rp.Stats.RecordSkipReason("daily_trade_cap")
				out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: "daily_trade_cap"})
				continue
			}
		}
		ok, reason := effective.Accepts(sig)
		if !ok {
			rp.Stats.RecordSkipReason(reason)
			out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: reason})
			continue
		}
		evalSig := sig
		if rp.Profile.InvertSignals {
			evalSig = InvertSignal(sig)
		}
		rec := rp.Risk.Evaluate(evalSig, candles, slippage)
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
	// SHORT decisions. Paper profiles are deliberately excluded: their
	// independent virtual positions cannot overwrite Bybit protection.
	demoBySide := make(map[risk.Side][]approvedRecommendation)
	for side, group := range approvedBySide {
		for _, a := range group {
			if m.profiles[a.index].Profile.ExecutionMode != ExecutionPaper {
				demoBySide[side] = append(demoBySide[side], a)
			}
		}
	}
	if len(demoBySide[risk.SideLong]) > 0 && len(demoBySide[risk.SideShort]) > 0 {
		for _, group := range demoBySide {
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

		var demoGroup, paperGroup []approvedRecommendation
		demoGroup, paperGroup = m.partitionExecutionGroups(group)
		executionGroup := group
		demoExecuted := false
		demoOrderID := ""
		if len(demoGroup) > 0 && m.demo != nil && m.demo.Enabled() {
			aggregate := aggregateRecommendation(demoGroup)
			reservationID := aggregateReservationID(aggregate)
			if err := m.accountRisk.Reserve(reservationID, aggregate); err != nil {
				for _, a := range demoGroup {
					rp := m.profiles[a.index]
					rp.Stats.RecordSkipReason("account_risk:" + err.Error())
					out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: "account_risk:" + err.Error()})
				}
				executionGroup = paperGroup
			} else {
				execCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
				demoRes, err := m.demo.ExecuteTrade(execCtx, "aggregate", aggregate)
				cancel()
				if err != nil {
					m.accountRisk.Release(reservationID)
					for _, a := range demoGroup {
						rp := m.profiles[a.index]
						rp.Stats.RecordSkipReason("demo_exec:" + err.Error())
						out = append(out, Result{Profile: rp.Profile, Skipped: true, Reason: "demo_exec:" + err.Error()})
					}
					executionGroup = paperGroup
				} else {
					demoExecuted = true
					demoOrderID = demoRes.OrderID
					m.accountRisk.Confirm(reservationID, demoOrderID)
				}
			}
		}

		for _, a := range executionGroup {
			rp := m.profiles[a.index]
			rp.Risk.RegisterExecuted(a.rec)
			rp.Journal.Record(a.rec, rp.Profile.ID, demoOrderID)
			rp.Stats.RecordOpen(a.rec)
			if rp.Learner != nil {
				rp.Learner.RecordOpen()
			}
			out = append(out, Result{
				Profile: rp.Profile, Rec: a.rec,
				DemoExecuted: demoExecuted, DemoOrderID: demoOrderID,
			})
		}
		if demoExecuted && demoOrderID != "" {
			allocations := make([]demoAllocation, 0, len(demoGroup))
			for _, a := range demoGroup {
				allocations = append(allocations, demoAllocation{index: a.index, rec: a.rec})
			}
			m.demoOrders[demoOrderID] = allocations
			m.savePendingLocked()
		}
	}
	return out
}

// partitionExecutionGroups is the final execution boundary. PAPER profiles may
// be evaluated and journaled alongside Demo profiles, but cannot contribute to
// an aggregate recommendation or receive an exchange order ID.
func (m *Manager) partitionExecutionGroups(group []approvedRecommendation) (demo, paper []approvedRecommendation) {
	for _, a := range group {
		if m.profiles[a.index].Profile.ExecutionMode == ExecutionPaper {
			paper = append(paper, a)
		} else {
			demo = append(demo, a)
		}
	}
	return demo, paper
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
	carryHold := m.carryMaxHold
	m.mu.RUnlock()
	now := time.Now().UTC()

	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rp := range m.profiles {
		rp.Stats.UpdateMark(symbol, price)
		for _, closed := range rp.Stats.CheckCarryMaturity(now, carryHold) {
			rp.Risk.CloseExecuted(closed.Recommendation, closed.PnL)
			rp.Journal.RecordClose(closed.Recommendation, rp.Profile.ID, "", closed.PnL, closed.CloseReason, closed.ClosedAt)
			if rp.Learner != nil {
				rp.Learner.RecordClose(closed.PnL >= 0, closed.Recommendation.Signal)
			}
		}
		// A paper profile retains the virtual lifecycle even while other
		// profiles have an exchange-backed aggregate position.
		if m.demo != nil && m.demo.Enabled() && rp.Profile.ExecutionMode != ExecutionPaper {
			continue // Exchange closed-PnL is authoritative for this profile.
		}
		for _, closed := range rp.Stats.CheckPrice(symbol, price) {
			rp.Risk.CloseExecuted(closed.Recommendation, closed.PnL)
			rp.Journal.RecordClose(
				closed.Recommendation,
				rp.Profile.ID,
				"",
				closed.PnL,
				closed.CloseReason,
				closed.ClosedAt,
			)
			if rp.Learner != nil {
				rp.Learner.RecordClose(closed.PnL >= 0, closed.Recommendation.Signal)
			}
		}
	}
	if m.demo != nil && m.demo.Enabled() {
		m.demo.HandlePrice(symbol, price)
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
		if !ok {
			// Bybit closed-PnL reports the closing order ID, while the
			// allocation map is keyed by the entry order ID. Resolve by the
			// unique pending position identity instead. A single aggregate
			// order per symbol/side is enforced by DemoTrader's symbol lock.
			allocations, ok = m.pendingAllocationForClosedTrade(trade)
		}
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
			rp.Stats.RecordExchangeCloseFor(a.rec, pnl)
			rp.Risk.CloseExecuted(a.rec, pnl)
			rp.Journal.RecordClose(a.rec, rp.Profile.ID, trade.OrderID, pnl, trade.CloseReason, trade.UpdatedAt)
			if rp.Learner != nil {
				rp.Learner.RecordClose(pnl >= 0, a.rec.Signal)
			}
		}
		m.reconciledOrders[trade.OrderID] = struct{}{}
		m.accountRisk.Release(trade.OrderID)
		m.removePendingAllocation(trade.OrderID, allocations)
		m.savePendingLocked()
		m.saveReconciledLocked()
	}
}

func (m *Manager) pendingAllocationForClosedTrade(trade execution.ClosedPnL) ([]demoAllocation, bool) {
	var matched []demoAllocation
	var matchedOrderID string
	for orderID, allocations := range m.demoOrders {
		if len(allocations) == 0 {
			continue
		}
		rec := allocations[0].rec
		if rec.Signal.Symbol != trade.Symbol {
			continue
		}
		// Closed-PnL side normally represents the closing order, which is
		// opposite to the entry. Accept an exact side as a compatibility
		// fallback for recorded/demo responses that expose entry side.
		if rec.Side != trade.Side && rec.Side != oppositeSide(trade.Side) {
			continue
		}
		if matched != nil {
			// Ambiguous matching must not silently allocate PnL to an
			// arbitrary virtual trader.
			return nil, false
		}
		matched = allocations
		matchedOrderID = orderID
	}
	if matched == nil {
		return nil, false
	}
	m.demoOrders[trade.OrderID] = matched
	delete(m.demoOrders, matchedOrderID)
	return matched, true
}

func (m *Manager) removePendingAllocation(closedOrderID string, allocations []demoAllocation) {
	delete(m.demoOrders, closedOrderID)
	for orderID, pending := range m.demoOrders {
		if len(pending) != len(allocations) {
			continue
		}
		if len(pending) > 0 && len(allocations) > 0 &&
			pending[0].rec.Signal.SignalID == allocations[0].rec.Signal.SignalID {
			delete(m.demoOrders, orderID)
			return
		}
	}
}

func oppositeSide(side risk.Side) risk.Side {
	if side == risk.SideLong {
		return risk.SideShort
	}
	return risk.SideLong
}

func sideToBybit(side risk.Side) string {
	if side == risk.SideShort {
		return "Sell"
	}
	return "Buy"
}

func (m *Manager) loadPending() {
	data, err := os.ReadFile(m.pendingPath)
	if err != nil {
		return
	}
	var stored map[string][]persistedDemoAllocation
	if json.Unmarshal(data, &stored) != nil {
		return
	}
	for orderID, allocations := range stored {
		for _, item := range allocations {
			for index, profile := range m.profiles {
				if profile.Profile.ID == item.ProfileID {
					m.demoOrders[orderID] = append(m.demoOrders[orderID], demoAllocation{
						index: index,
						rec:   item.Rec,
					})
					break
				}
			}
		}
	}
}

func toApproved(allocations []demoAllocation) []approvedRecommendation {
	out := make([]approvedRecommendation, 0, len(allocations))
	for _, allocation := range allocations {
		out = append(out, approvedRecommendation{index: allocation.index, rec: allocation.rec})
	}
	return out
}

func aggregateReservationID(rec risk.TradeRecommendation) string {
	return strings.Join([]string{
		rec.Signal.SignalID, rec.Signal.Symbol, string(rec.Side), rec.Timestamp.UTC().Format(time.RFC3339Nano),
	}, "|")
}

func (m *Manager) loadReconciled() {
	data, err := os.ReadFile(m.reconciledPath)
	if err != nil {
		return
	}
	var stored []string
	if json.Unmarshal(data, &stored) != nil {
		return
	}
	for _, orderID := range stored {
		if orderID != "" {
			m.reconciledOrders[orderID] = struct{}{}
		}
	}
}

// savePendingLocked persists only exchange orders which have not yet appeared
// in closed-PnL. It is called under Manager.mu, making restarts idempotent.
func (m *Manager) savePendingLocked() {
	stored := make(map[string][]persistedDemoAllocation, len(m.demoOrders))
	for orderID, allocations := range m.demoOrders {
		for _, allocation := range allocations {
			stored[orderID] = append(stored[orderID], persistedDemoAllocation{
				ProfileID: m.profiles[allocation.index].Profile.ID,
				Rec:       allocation.rec,
			})
		}
	}
	data, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(m.pendingPath), 0o755); err != nil {
		return
	}
	tmp := m.pendingPath + ".tmp"
	if os.WriteFile(tmp, data, 0o644) == nil {
		_ = os.Rename(tmp, m.pendingPath)
	}
}

func (m *Manager) saveReconciledLocked() {
	stored := make([]string, 0, len(m.reconciledOrders))
	for orderID := range m.reconciledOrders {
		stored = append(stored, orderID)
	}
	sort.Strings(stored)
	data, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(m.reconciledPath), 0o755); err != nil {
		return
	}
	tmp := m.reconciledPath + ".tmp"
	if os.WriteFile(tmp, data, 0o644) == nil {
		_ = os.Rename(tmp, m.reconciledPath)
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

func (m *Manager) EquityForProfile(profileID string) float64 {
	profileID = ResolveProfileID(profileID)
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rp := range m.profiles {
		if rp.Profile.ID == profileID {
			if rp.Profile.EquityUSDT > 0 {
				return rp.Profile.EquityUSDT
			}
			break
		}
	}
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
			history := rp.Journal.Recent(limit)
			index := make(map[string]int, len(history))
			for i, entry := range history {
				if entry.SignalID != "" {
					index[entry.SignalID] = i
				}
			}
			for _, position := range rp.Stats.OpenPositions() {
				pnl := position.UnrealizedPnL
				entry := HistoryEntry{
					SignalID: position.ID, Symbol: position.Symbol, Side: position.Side,
					Entry: position.Entry, MarkPrice: position.MarkPrice, Unrealized: true,
					OpenedAt: position.OpenedAt, PnL: &pnl,
				}
				if i, exists := index[position.ID]; exists {
					history[i] = entry
					continue
				}
				history = append(history, entry)
			}
			sort.Slice(history, func(i, j int) bool {
				return history[i].OpenedAt.After(history[j].OpenedAt)
			})
			if limit > 0 && len(history) > limit {
				history = history[:limit]
			}
			return history, true
		}
	}
	return nil, false
}

func (m *Manager) Position(profileID, signalID string) (HistoryEntry, bool) {
	history, ok := m.History(profileID, 100)
	if !ok {
		return HistoryEntry{}, false
	}
	for _, entry := range history {
		if entry.SignalID == signalID {
			return entry, true
		}
	}
	return HistoryEntry{}, false
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
			fmt.Fprintf(&b, "%s %s — 📝 virtual allocation | %dx | $%.0f | R:R 1:%.1f%s",
				r.Profile.Emoji, r.Profile.Name, r.Rec.Leverage, r.Rec.NotionalUSDT, r.Rec.RiskReward, extra)
			if r.DemoExecuted {
				b.WriteString(" | 🏦 demo order accepted; fill/reconciliation pending")
			}
			b.WriteByte('\n')
		}
	}
	return b.String()
}

package strategy

import (
	"fmt"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
)

type Engine struct {
	cfg      config.StrategyConfig
	thr      config.Thresholds
	detector *analyzer.Detector
	trackers *trackerStore
}

func NewEngine(cfg *config.Config, detector *analyzer.Detector) *Engine {
	y := cfg.Snapshot()
	return &Engine{
		cfg:      y.Strategy,
		thr:      y.Thresholds,
		detector: detector,
		trackers: newTrackerStore(),
	}
}

func (e *Engine) Enabled() bool {
	return e.cfg.Enabled
}

// Process evaluates market state and returns zero or more outcomes (impulse watch + trade signals).
func (e *Engine) Process(symbol string, st *analyzer.SymbolState, now time.Time) []Outcome {
	if !e.cfg.Enabled {
		return nil
	}

	price := st.LastPrice()
	var out []Outcome

	if tr, ok := e.trackers.get(symbol); ok {
		tr.updatePrice(price)
		elapsed := now.Sub(tr.StartedAt)

		o, done := e.evaluateTrack(tr, st, now, elapsed)
		if o != nil {
			out = append(out, *o)
		}
		if done {
			e.trackers.remove(symbol)
			e.trackers.setCooldown(symbol, now.Add(5*time.Minute))
		}
		return out
	}

	if e.trackers.onCooldown(symbol, now) {
		return nil
	}

	raw, ok := e.detector.Evaluate(symbol, st, now)
	if !ok || raw == nil {
		return nil
	}
	sig := *raw

	v := runVetoes(sig, e.cfg, false)
	if v.Blocked {
		return nil
	}

	sig.Score -= v.Penalty
	if sig.Score < e.cfg.MinScoreImpulse {
		return nil
	}

	// HOT — immediate confirmed trade, skip confirmation window.
	if e.cfg.HotBypassConfirm && e.isHot(sig) {
		confirmed := e.buildConfirmed(sig, st, now)
		if confirmed != nil {
			out = append(out, *confirmed)
			e.trackers.setCooldown(symbol, now.Add(10*time.Minute))
		}
		return out
	}

	tr := &impulseTrack{
		Symbol:      symbol,
		StartedAt:   now,
		ImpulseDir:  sig.Movement,
		StartPrice:  price,
		PeakPrice:   price,
		TroughPrice: price,
		Base:        sig,
	}
	e.trackers.start(tr)

	if e.cfg.ImpulseAlerts {
		imp := e.buildImpulse(sig, now)
		out = append(out, imp)
	}

	return out
}

func (e *Engine) isHot(sig analyzer.Signal) bool {
	return sig.Score >= e.cfg.MinScoreHot &&
		len(sig.Triggers) >= 3 &&
		sig.Volume1m >= e.cfg.MinVol1mUSDT
}

func (e *Engine) evaluateTrack(tr *impulseTrack, st *analyzer.SymbolState, now time.Time, elapsed time.Duration) (*Outcome, bool) {
	minWait := time.Duration(e.cfg.ConfirmMinSec) * time.Second
	maxWait := time.Duration(e.cfg.ConfirmMaxSec) * time.Second

	if elapsed < minWait {
		return nil, false
	}

	price := st.LastPrice()
	orderflow := st.OrderflowDelta()

	if elapsed >= maxWait || e.shouldResolve(tr, price, orderflow) {
		if o := e.resolveFollowFade(tr, st, now, price, orderflow); o != nil {
			return o, true
		}
		return nil, true
	}

	return nil, false
}

func (e *Engine) shouldResolve(tr *impulseTrack, price, orderflow float64) bool {
	retrace := tr.retrace(price)
	if retrace >= e.cfg.FadeRetracePct {
		return true
	}
	if tr.ImpulseDir == "PUMP" && orderflow < 0 && retrace > 25 {
		return true
	}
	if tr.ImpulseDir == "DUMP" && orderflow > 0 && retrace > 25 {
		return true
	}
	return false
}

func (e *Engine) resolveFollowFade(tr *impulseTrack, st *analyzer.SymbolState, now time.Time, price, orderflow float64) *Outcome {
	var sig analyzer.Signal
	if raw, ok := e.detector.Evaluate(tr.Symbol, st, now); ok && raw != nil {
		sig = *raw
	} else {
		sig = tr.Base
		sig.Price = price
		sig.Timestamp = now
	}

	retrace := tr.retrace(price)

	if tr.ImpulseDir == "PUMP" {
		if e.cfg.FadeEnabled && retrace >= e.cfg.FadeRetracePct && orderflow <= 0 {
			return e.buildFade(sig, ActionShort, "FADE_SHORT", now, []string{
				fmt.Sprintf("pump failed: retrace %.1f%% from high $%.6g", retrace, tr.PeakPrice),
				fmt.Sprintf("orderflow flipped sell ($%.0f)", orderflow),
				fmt.Sprintf("high $%.6g → now $%.6g", tr.PeakPrice, price),
			})
		}
		if price >= tr.StartPrice && orderflow >= 0 && retrace < e.cfg.FadeRetracePct {
			return e.buildConfirmedFrom(tr, sig, st, now, ActionLong, "SHORT_SQUEEZE", []string{
				fmt.Sprintf("pump confirmed: holding above entry zone $%.6g", tr.StartPrice),
				fmt.Sprintf("retrace only %.1f%% (< %.0f%%)", retrace, e.cfg.FadeRetracePct),
				fmt.Sprintf("orderflow buy $%.0f", orderflow),
			})
		}
	}

	if tr.ImpulseDir == "DUMP" {
		if e.cfg.FadeEnabled && retrace >= e.cfg.FadeRetracePct && orderflow >= 0 {
			return e.buildFade(sig, ActionLong, "FADE_LONG", now, []string{
				fmt.Sprintf("dump failed: bounce %.1f%% from low $%.6g", retrace, tr.TroughPrice),
				fmt.Sprintf("orderflow flipped buy ($%.0f)", orderflow),
			})
		}
		if price <= tr.StartPrice && orderflow <= 0 && retrace < e.cfg.FadeRetracePct {
			return e.buildConfirmedFrom(tr, sig, st, now, ActionShort, "LONG_LIQUIDATION", []string{
				fmt.Sprintf("dump confirmed below $%.6g", tr.StartPrice),
				fmt.Sprintf("orderflow sell $%.0f", orderflow),
			})
		}
	}

	return nil
}

func (e *Engine) buildImpulse(sig analyzer.Signal, now time.Time) Outcome {
	sig.AlertType = AlertImpulse
	sig.TradeAction = movementToAction(sig.Movement)
	sig.SignalID = fmt.Sprintf("%s-%s", now.Format("20060102150405"), sig.Symbol)
	sig.Reasons = []string{
		"impulse detected — ждём подтверждения 30–120 сек",
		fmt.Sprintf("vol $%.0f (x%.1f)", sig.Volume1m, sig.VolumeRatio),
	}
	return Outcome{Signal: sig, Tradeable: false, CooldownKey: "impulse"}
}

func (e *Engine) buildConfirmed(sig analyzer.Signal, st *analyzer.SymbolState, now time.Time) *Outcome {
	action := movementToAction(sig.Movement)
	alert := AlertConfirmed
	if e.isHot(sig) {
		alert = AlertHot
	}
	reasons := []string{
		fmt.Sprintf("HOT: score %d, %d triggers", sig.Score, len(sig.Triggers)),
		fmt.Sprintf("vol $%.0f", sig.Volume1m),
	}
	o := e.buildConfirmedFrom(nil, sig, st, now, action, sig.SetupType, reasons)
	if o != nil {
		o.Signal.AlertType = alert
	}
	return o
}

func (e *Engine) buildConfirmedFrom(tr *impulseTrack, sig analyzer.Signal, st *analyzer.SymbolState, now time.Time, action, setup string, reasons []string) *Outcome {
	sig.AlertType = AlertConfirmed
	sig.TradeAction = action
	sig.SetupType = setup
	sig.Movement = actionToMovement(action)
	sig.Timestamp = now
	sig.Price = st.LastPrice()
	sig.SignalID = fmt.Sprintf("%s-%s", now.Format("20060102150405"), sig.Symbol)

	if len(sig.Triggers) < e.cfg.MinTriggersConfirmed && tr != nil {
		return nil
	}

	v := runVetoes(sig, e.cfg, true)
	if v.Blocked {
		return nil
	}
	sig.Score -= v.Penalty
	if sig.Score < e.cfg.MinScoreConfirmed {
		return nil
	}
	sig.Reasons = append(reasons, v.Reasons...)

	return &Outcome{Signal: sig, Tradeable: true, CooldownKey: "confirmed"}
}

func (e *Engine) buildFade(sig analyzer.Signal, action, setup string, now time.Time, reasons []string) *Outcome {
	sig.AlertType = AlertFade
	sig.TradeAction = action
	sig.SetupType = setup
	sig.Movement = actionToMovement(action)
	sig.Timestamp = now
	sig.SignalID = fmt.Sprintf("%s-%s", now.Format("20060102150405"), sig.Symbol)

	v := runVetoes(sig, e.cfg, true)
	if v.Blocked {
		return nil
	}
	sig.Score -= v.Penalty
	if sig.Score < e.cfg.MinScoreConfirmed {
		return nil
	}
	sig.Reasons = append(reasons, v.Reasons...)

	return &Outcome{Signal: sig, Tradeable: true, CooldownKey: "fade"}
}

func movementToAction(m string) string {
	if m == "DUMP" {
		return ActionShort
	}
	return ActionLong
}

func actionToMovement(a string) string {
	if a == ActionShort {
		return "DUMP"
	}
	return "PUMP"
}

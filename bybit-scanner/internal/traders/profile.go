package traders

import (
	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"strings"
)

type ExecutionMode string

const (
	// ExecutionDemoAggregate permits this profile to contribute to the single
	// bot-owned Bybit Demo order for its symbol and side.
	ExecutionDemoAggregate ExecutionMode = "demo_aggregate"
	// ExecutionPaper keeps a profile entirely virtual. It has its own
	// journal/stats lifecycle and never contributes quantity to Bybit.
	ExecutionPaper ExecutionMode = "paper"
)

type Profile struct {
	ID               string
	Name             string
	Emoji            string
	Description      string
	MinScore         int
	MinVol1mUSDT     float64
	MinTriggers      int
	AllowFade        bool
	AllowHotOnly     bool
	LeverageMax      int
	RiskMult         float64
	MaxOpen          int
	MinRR            float64
	MinSLDistancePct float64
	MinSLLiqBuffer   float64 // lower = allows higher leverage trades
	TelegramNotify   bool
	// Strategy filters (4th trader / unique tactics)
	MomentumOnly    bool // only CONFIRMED + HOT (follow impulse)
	FadeOnly        bool // only FADE setups
	MaxScore        int  // 0 = no cap (fade mid-range)
	Strategy        string
	MinTapePoints   int
	MaxNotionalUSDT float64
	ExecutionMode   ExecutionMode
	// InvertSignals trades opposite to the detector direction (contrarian).
	InvertSignals bool
	// AdaptiveLearn adjusts min tape/score thresholds from recent closes.
	AdaptiveLearn bool
	// MaxTradesPerDay caps new opens per UTC day (0 = unlimited).
	MaxTradesPerDay int
	// MaxSpreadPct overrides tape spread veto when > 0.
	MaxSpreadPct float64
	// EquityUSDT overrides global equity_per_trader_usdt when > 0.
	EquityUSDT float64
}

func (p Profile) Accepts(sig analyzer.Signal) (bool, string) {
	// This guard intentionally precedes strategy-specific acceptance. A future
	// momentum-only strategy must not accidentally inherit legacy FADE inputs.
	if p.MomentumOnly && sig.AlertType == "FADE" {
		return false, "momentum_fade_disabled"
	}
	if p.Strategy == "tape_sync" {
		return acceptsTapeSync(p, sig)
	}
	if p.Strategy == "carry_arbitrage" {
		if sig.SetupType != "CARRY_ARBITRAGE" || sig.AlertType != "CARRY" {
			return false, "carry_only"
		}
		if sig.Score < p.MinScore {
			return false, "score_low"
		}
		return true, ""
	}
	if p.Strategy == "indicator_mtf" {
		if sig.SetupType != "MTF_INDICATOR_5" || sig.AlertType != "INDICATOR_MTF" {
			return false, "indicator_mtf_only"
		}
		if sig.Score < p.MinScore {
			return false, "score_low"
		}
		if sig.Volume1m < p.MinVol1mUSDT {
			return false, "vol_low"
		}
		return true, ""
	}
	if p.Strategy == "momentum_scalper_tier_a" {
		if sig.SetupType != "MOMENTUM_SCALPER_TIER_A" || sig.AlertType != "MOMENTUM_TIER_A" {
			return false, "momentum_tier_a_only"
		}
	} else if sig.SetupType == "MOMENTUM_SCALPER_TIER_A" {
		// Legacy profiles must never consume strict momentum signals.
		return false, "strategy_mismatch"
	}
	if sig.AlertType == "IMPULSE" {
		return false, "impulse_watch_only"
	}
	if sig.Score < p.MinScore {
		return false, "score_low"
	}
	if sig.Volume1m < p.MinVol1mUSDT {
		return false, "vol_low"
	}
	if len(sig.Triggers) < p.MinTriggers {
		return false, "triggers_low"
	}
	if !p.AllowFade && sig.AlertType == "FADE" {
		return false, "fade_disabled"
	}
	if p.AllowHotOnly && sig.AlertType != "HOT" && sig.Score < p.MinScore+5 {
		return false, "not_hot_enough"
	}
	if p.MomentumOnly && sig.AlertType != "CONFIRMED" && sig.AlertType != "HOT" {
		return false, "momentum_only"
	}
	if p.FadeOnly && sig.AlertType != "FADE" {
		return false, "fade_only"
	}
	if p.MaxScore > 0 && sig.Score > p.MaxScore {
		return false, "score_too_high"
	}
	return true, ""
}

// DefaultProfiles — консенсус агентов: Саша / Дима / Ваня / Коля / Миша.
func DefaultProfiles(base config.RiskConfig) []Profile {
	return []Profile{
		{
			ID: "sniper", Name: "Саша", Emoji: "🎯",
			Description: "Снайпер — только топ-сетапы HOT, мало сделок, высокий WR",
			MinScore:    85, MinVol1mUSDT: 100_000, MinTriggers: 3,
			AllowFade: false, AllowHotOnly: true,
			LeverageMax: 5, RiskMult: 0.4, MaxOpen: 2, MinRR: 2.2,
			MinSLLiqBuffer: 0.8, TelegramNotify: true,
		},
		{
			ID: "strategist", Name: "Дима", Emoji: "⚖️",
			Description: "Стратег — золотая середина, стабильный ROI",
			MinScore:    75, MinVol1mUSDT: 50_000, MinTriggers: 2,
			AllowFade: false, AllowHotOnly: false,
			LeverageMax: 10, RiskMult: 1.0, MaxOpen: 4, MinRR: 1.8,
			MinSLLiqBuffer: 0.5, TelegramNotify: true,
		},
		{
			ID: "agressor", Name: "Ваня", Emoji: "🔥",
			Description: "Агрессор — fade + низкий порог, плечо до 50x",
			MinScore:    55, MinVol1mUSDT: 20_000, MinTriggers: 2,
			AllowFade: true, AllowHotOnly: false,
			LeverageMax: 50, RiskMult: 1.6, MaxOpen: 10, MinRR: 1.2,
			MinSLLiqBuffer: 0.08, TelegramNotify: true,
		},
		{
			ID: "kolya", Name: "Коля", Emoji: "⚡",
			Description: "Пульс+ — momentum CONFIRM/HOT на объёме, цель 10+ сделок/день",
			MinScore:    48, MinVol1mUSDT: 12_000, MinTriggers: 1,
			AllowFade: false, AllowHotOnly: false, MomentumOnly: true,
			LeverageMax: 15, RiskMult: 0.7, MaxOpen: 15, MinRR: 1.1,
			MinSLLiqBuffer: 0.10, TelegramNotify: true,
		},
		{
			ID: "misha", Name: "Миша", Emoji: "📼",
			Description: "Tape/FADE sync, adaptive learn, до 100 сделок/день",
			Strategy:    "tape_sync",
			MinScore:    32, MaxScore: 70, MinVol1mUSDT: 5_000, MinTriggers: 0,
			MinTapePoints: 2, AllowFade: true, AdaptiveLearn: true,
			MaxTradesPerDay: 100, MaxSpreadPct: 0.35,
			LeverageMax: 10, RiskMult: 0.5, MaxOpen: 40, MinRR: 0.85, MinSLDistancePct: 0.04,
			MinSLLiqBuffer: 0.05, MaxNotionalUSDT: 200, TelegramNotify: true,
			ExecutionMode: ExecutionDemoAggregate,
		},
		{
			ID: "katya", Name: "Катя", Emoji: "⚖️",
			Description: "Spot↔Linear арбитраж и хедж, депозит $1000",
			Strategy: "carry_arbitrage", ExecutionMode: ExecutionPaper,
			MinScore: 25, MinVol1mUSDT: 0, MinTriggers: 0,
			LeverageMax: 2, RiskMult: 0.35, MaxOpen: 5, MinRR: 0.5,
			MaxNotionalUSDT: 900, EquityUSDT: 1000, TelegramNotify: true,
		},
		{
			ID: "oleg", Name: "Олег", Emoji: "📊",
			Description: "5 индикаторов · MTF 5m/15m · объёмные входы",
			Strategy: "indicator_mtf", ExecutionMode: ExecutionPaper,
			MinScore: 60, MinVol1mUSDT: 20_000, MinTriggers: 0,
			LeverageMax: 12, RiskMult: 0.8, MaxOpen: 8, MinRR: 1.2,
			TelegramNotify: true,
		},
	}
}

func MergeProfiles(yamlCfg config.TradersConfig, base config.RiskConfig) []Profile {
	if len(yamlCfg.Profiles) == 0 {
		return DefaultProfiles(base)
	}
	out := make([]Profile, 0, len(yamlCfg.Profiles))
	for _, yp := range yamlCfg.Profiles {
		p := Profile{
			ID: yp.ID, Name: yp.Name, Emoji: yp.Emoji, Description: yp.Description,
			MinScore: yp.MinScore, MinVol1mUSDT: yp.MinVol1mUSDT, MinTriggers: yp.MinTriggers,
			AllowFade: yp.AllowFade, AllowHotOnly: yp.AllowHotOnly,
			LeverageMax: yp.LeverageMax, RiskMult: yp.RiskMult, MaxOpen: yp.MaxOpen,
			MinRR: yp.MinRR, MinSLDistancePct: yp.MinSLDistancePct, MinSLLiqBuffer: yp.MinSLLiqBuffer, TelegramNotify: yp.TelegramNotify,
			MomentumOnly: yp.MomentumOnly, FadeOnly: yp.FadeOnly, MaxScore: yp.MaxScore,
			Strategy: yp.Strategy, MinTapePoints: yp.MinTapePoints, MaxNotionalUSDT: yp.MaxNotionalUSDT,
			ExecutionMode: ExecutionMode(strings.ToLower(strings.TrimSpace(yp.ExecutionMode))),
			InvertSignals: yp.InvertSignals, AdaptiveLearn: yp.AdaptiveLearn,
			MaxTradesPerDay: yp.MaxTradesPerDay, MaxSpreadPct: yp.MaxSpreadPct,
			EquityUSDT: yp.EquityUSDT,
		}
		if p.ID == "" {
			continue
		}
		applyProfileDefaults(&p)
		out = append(out, p)
	}
	return out
}

func applyProfileDefaults(p *Profile) {
	if p.ExecutionMode == "" {
		p.ExecutionMode = ExecutionDemoAggregate
	}
	switch p.ExecutionMode {
	case "demo", "demo_aggregate":
		p.ExecutionMode = ExecutionDemoAggregate
	case ExecutionPaper:
	default:
		// An unknown mode must never gain exchange execution rights.
		p.ExecutionMode = ExecutionPaper
	}
	if p.MinScore == 0 {
		p.MinScore = 70
	}
	if p.MinVol1mUSDT == 0 {
		p.MinVol1mUSDT = 30_000
	}
	if p.MinTriggers == 0 && p.Strategy != "tape_sync" {
		p.MinTriggers = 2
	}
	if p.LeverageMax == 0 {
		p.LeverageMax = 10
	}
	if p.RiskMult == 0 {
		p.RiskMult = 1.0
	}
	if p.MaxOpen == 0 {
		p.MaxOpen = 4
	}
	if p.MinRR == 0 {
		p.MinRR = 1.8
	}
	if p.MinSLLiqBuffer == 0 {
		p.MinSLLiqBuffer = 0.5
	}
	if p.Strategy == "tape_sync" && p.MinTapePoints == 0 {
		p.MinTapePoints = 2
	}
}

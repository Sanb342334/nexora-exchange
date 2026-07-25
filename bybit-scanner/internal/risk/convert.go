package risk

import "bybit-scanner/internal/config"

func ConfigFromApp(c config.RiskConfig) Config {
	out := Config{
		Enabled: c.Enabled,
		Account: AccountConfig{
			DemoEquityUSDT: c.Account.DemoEquityUSDT,
			LiveEquityUSDT: c.Account.LiveEquityUSDT,
			AccountRiskPct: c.Account.AccountRiskPct,
			ScoreFactorMin: c.Account.ScoreFactorMin,
		},
		Sizing: SizingConfig{
			VolRefRatio:       c.Sizing.VolRefRatio,
			VolFactorMin:      c.Sizing.VolFactorMin,
			ATRRefPct:         c.Sizing.ATRRefPct,
			ATRFactorMin:      c.Sizing.ATRFactorMin,
			MaxNotionalUSDT:   c.Sizing.MaxNotionalUSDT,
			MaxNotionalPct:    c.Sizing.MaxNotionalPct,
			MaxMarginUsagePct: c.Sizing.MaxMarginUsagePct,
		},
		Stops: StopsConfig{
			Method:             c.Stops.Method,
			StructureLookback:  c.Stops.StructureLookback,
			StructureBufferPct: c.Stops.StructureBufferPct,
			MinSLDistancePct:   c.Stops.MinSLDistancePct,
			MinRR:              c.Stops.MinRR,
			MaxTPATRMult:       c.Stops.MaxTPATRMult,
			SLATRMult:          c.Stops.SLATRMult,
			TPATRMult:          c.Stops.TPATRMult,
			BySetup:            copySetupStops(c.Stops.BySetup),
		},
		Leverage: LeverageConfig{
			Min:               c.Leverage.Min,
			Max:               c.Leverage.Max,
			ATRRefPct:         c.Leverage.ATRRefPct,
			LiqBufferMult:     c.Leverage.LiqBufferMult,
			MaxSLToLiqRatio:   c.Leverage.MaxSLToLiqRatio,
			MinSLLiqBufferPct: c.Leverage.MinSLLiqBufferPct,
			BySetup:           copyIntMap(c.Leverage.BySetup),
		},
		Portfolio: PortfolioConfig{
			MaxOpenPositions: ModeLimits{
				Demo: c.Portfolio.MaxOpenPositions.Demo,
				Live: c.Portfolio.MaxOpenPositions.Live,
			},
			MaxSameBucketSameSide: c.Portfolio.MaxSameBucketSameSide,
			MaxTotalSameSide:      c.Portfolio.MaxTotalSameSide,
			MaxGrossExposurePct:   c.Portfolio.MaxGrossExposurePct,
			CorrelationBuckets:    copyStringSliceMap(c.Portfolio.CorrelationBuckets),
		},
		Limits: LimitsConfig{
			DailyLossLimitPct: ModeFloatLimits{
				Demo: c.Limits.DailyLossLimitPct.Demo,
				Live: c.Limits.DailyLossLimitPct.Live,
			},
			MaxConsecutiveLosses: ModeLimits{
				Demo: c.Limits.MaxConsecutiveLosses.Demo,
				Live: c.Limits.MaxConsecutiveLosses.Live,
			},
			LossCooldownHours: c.Limits.LossCooldownHours,
		},
		Demo: DemoModeConfig{
			BadgeAlerts:       c.Demo.BadgeAlerts,
			SeparateJournal:   c.Demo.SeparateJournal,
			AllowOnKillSwitch: c.Demo.AllowOnKillSwitch,
		},
		Live: LiveModeConfig{
			RequireExplicitEnable: c.Live.RequireExplicitEnable,
			MinScore:              c.Live.MinScore,
		},
	}
	ApplyDefaults(&out)
	return out
}

func copySetupStops(in map[string]config.RiskSetupStops) map[string]SetupStops {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]SetupStops, len(in))
	for k, v := range in {
		out[k] = SetupStops{SLATRMult: v.SLATRMult, TPATRMult: v.TPATRMult, MinRR: v.MinRR}
	}
	return out
}

func copyIntMap(in map[string]int) map[string]int {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]int, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func copyStringSliceMap(in map[string][]string) map[string][]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string][]string, len(in))
	for k, v := range in {
		cp := make([]string, len(v))
		copy(cp, v)
		out[k] = cp
	}
	return out
}

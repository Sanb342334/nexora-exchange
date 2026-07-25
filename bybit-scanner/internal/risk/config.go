package risk

type SetupStops struct {
	SLATRMult float64 `yaml:"sl_atr_mult"`
	TPATRMult float64 `yaml:"tp_atr_mult"`
	MinRR     float64 `yaml:"min_rr"`
}

type AccountConfig struct {
	DemoEquityUSDT  float64 `yaml:"demo_equity_usdt"`
	LiveEquityUSDT  float64 `yaml:"live_equity_usdt"`
	AccountRiskPct  float64 `yaml:"account_risk_pct"`
	ScoreFactorMin  float64 `yaml:"score_factor_min"`
}

type SizingConfig struct {
	VolRefRatio        float64 `yaml:"vol_ref_ratio"`
	VolFactorMin       float64 `yaml:"vol_factor_min"`
	ATRRefPct          float64 `yaml:"atr_ref_pct"`
	ATRFactorMin       float64 `yaml:"atr_factor_min"`
	MaxNotionalUSDT    float64 `yaml:"max_notional_usdt"`
	MaxNotionalPct     float64 `yaml:"max_notional_pct"`
	MaxMarginUsagePct  float64 `yaml:"max_margin_usage_pct"`
}

type StopsConfig struct {
	Method              string                `yaml:"method"`
	StructureLookback   int                   `yaml:"structure_lookback"`
	StructureBufferPct  float64               `yaml:"structure_buffer_pct"`
	MinSLDistancePct    float64               `yaml:"min_sl_distance_pct"`
	MinRR               float64               `yaml:"min_rr"`
	MaxTPATRMult        float64               `yaml:"max_tp_atr_mult"`
	SLATRMult           float64               `yaml:"sl_atr_mult"`
	TPATRMult           float64               `yaml:"tp_atr_mult"`
	BySetup             map[string]SetupStops `yaml:"by_setup"`
}

type LeverageConfig struct {
	Min               int                `yaml:"min"`
	Max               int                `yaml:"max"`
	ATRRefPct         float64            `yaml:"atr_ref_pct"`
	LiqBufferMult     float64            `yaml:"liq_buffer_mult"`
	MaxSLToLiqRatio   float64            `yaml:"max_sl_to_liq_ratio"`
	MinSLLiqBufferPct float64            `yaml:"min_sl_liq_buffer_pct"`
	BySetup           map[string]int     `yaml:"by_setup"`
}

type ModeLimits struct {
	Demo int `yaml:"demo"`
	Live int `yaml:"live"`
}

type ModeFloatLimits struct {
	Demo float64 `yaml:"demo"`
	Live float64 `yaml:"live"`
}

type PortfolioConfig struct {
	MaxOpenPositions        ModeLimits           `yaml:"max_open_positions"`
	MaxSameBucketSameSide   int                  `yaml:"max_same_bucket_same_side"`
	MaxTotalSameSide        int                  `yaml:"max_total_same_side"`
	MaxGrossExposurePct     float64              `yaml:"max_gross_exposure_pct"`
	CorrelationBuckets      map[string][]string  `yaml:"correlation_buckets"`
}

type LimitsConfig struct {
	DailyLossLimitPct    ModeFloatLimits `yaml:"daily_loss_limit_pct"`
	MaxConsecutiveLosses ModeLimits      `yaml:"max_consecutive_losses"`
	LossCooldownHours    int             `yaml:"loss_cooldown_hours"`
}

type DemoModeConfig struct {
	BadgeAlerts         bool `yaml:"badge_alerts"`
	SeparateJournal     bool `yaml:"separate_journal"`
	AllowOnKillSwitch   bool `yaml:"allow_on_kill_switch"`
}

type LiveModeConfig struct {
	RequireExplicitEnable bool `yaml:"require_explicit_enable"`
	MinScore              int  `yaml:"min_score"`
}

type Config struct {
	Enabled   bool             `yaml:"enabled"`
	Account   AccountConfig    `yaml:"account"`
	Sizing    SizingConfig     `yaml:"sizing"`
	Stops     StopsConfig      `yaml:"stops"`
	Leverage  LeverageConfig   `yaml:"leverage"`
	Portfolio PortfolioConfig  `yaml:"portfolio"`
	Limits    LimitsConfig     `yaml:"limits"`
	Demo      DemoModeConfig   `yaml:"demo"`
	Live      LiveModeConfig   `yaml:"live"`
}

func ApplyDefaults(c *Config) {
	if c.Account.DemoEquityUSDT == 0 {
		c.Account.DemoEquityUSDT = 10_000
	}
	if c.Account.AccountRiskPct == 0 {
		c.Account.AccountRiskPct = 0.75
	}
	if c.Account.ScoreFactorMin == 0 {
		c.Account.ScoreFactorMin = 0.5
	}
	if c.Sizing.VolRefRatio == 0 {
		c.Sizing.VolRefRatio = 4.0
	}
	if c.Sizing.VolFactorMin == 0 {
		c.Sizing.VolFactorMin = 0.4
	}
	if c.Sizing.ATRRefPct == 0 {
		c.Sizing.ATRRefPct = 2.0
	}
	if c.Sizing.ATRFactorMin == 0 {
		c.Sizing.ATRFactorMin = 0.5
	}
	if c.Sizing.MaxNotionalUSDT == 0 {
		c.Sizing.MaxNotionalUSDT = 5000
	}
	if c.Sizing.MaxNotionalPct == 0 {
		c.Sizing.MaxNotionalPct = 15
	}
	if c.Sizing.MaxMarginUsagePct == 0 {
		c.Sizing.MaxMarginUsagePct = 25
	}
	if c.Stops.Method == "" {
		c.Stops.Method = "blended"
	}
	if c.Stops.StructureLookback == 0 {
		c.Stops.StructureLookback = 15
	}
	if c.Stops.StructureBufferPct == 0 {
		c.Stops.StructureBufferPct = 0.1
	}
	if c.Stops.MinSLDistancePct == 0 {
		c.Stops.MinSLDistancePct = 0.35
	}
	if c.Stops.MinRR == 0 {
		c.Stops.MinRR = 1.8
	}
	if c.Stops.MaxTPATRMult == 0 {
		c.Stops.MaxTPATRMult = 4.0
	}
	if c.Stops.SLATRMult == 0 {
		c.Stops.SLATRMult = 1.0
	}
	if c.Stops.TPATRMult == 0 {
		c.Stops.TPATRMult = 2.0
	}
	if c.Leverage.Min == 0 {
		c.Leverage.Min = 2
	}
	if c.Leverage.Max == 0 {
		c.Leverage.Max = 10
	}
	if c.Leverage.ATRRefPct == 0 {
		c.Leverage.ATRRefPct = 2.0
	}
	if c.Leverage.LiqBufferMult == 0 {
		c.Leverage.LiqBufferMult = 1.5
	}
	if c.Leverage.MaxSLToLiqRatio == 0 {
		c.Leverage.MaxSLToLiqRatio = 0.85
	}
	if c.Leverage.MinSLLiqBufferPct == 0 {
		c.Leverage.MinSLLiqBufferPct = 0.3
	}
	if c.Leverage.BySetup == nil {
		c.Leverage.BySetup = map[string]int{
			"SHORT_SQUEEZE":         5,
			"LONG_LIQUIDATION":      5,
			"OVERLEVERAGED_LONGS":   3,
			"OVERLEVERAGED_SHORTS":  3,
			"PUMP":                  8,
			"DUMP":                  8,
			"TEST_SIGNAL":           1,
		}
	}
	if c.Stops.BySetup == nil {
		c.Stops.BySetup = map[string]SetupStops{
			"SHORT_SQUEEZE":       {SLATRMult: 1.2, TPATRMult: 2.5, MinRR: 2.0},
			"LONG_LIQUIDATION":    {SLATRMult: 1.0, TPATRMult: 2.0, MinRR: 1.8},
			"OVERLEVERAGED_LONGS": {SLATRMult: 1.5, TPATRMult: 2.0, MinRR: 2.0},
			"PUMP":                {SLATRMult: 0.8, TPATRMult: 2.5, MinRR: 1.5},
			"DUMP":                {SLATRMult: 0.8, TPATRMult: 2.5, MinRR: 1.5},
		}
	}
	if c.Portfolio.MaxOpenPositions.Demo == 0 {
		c.Portfolio.MaxOpenPositions.Demo = 8
	}
	if c.Portfolio.MaxOpenPositions.Live == 0 {
		c.Portfolio.MaxOpenPositions.Live = 4
	}
	if c.Portfolio.MaxSameBucketSameSide == 0 {
		c.Portfolio.MaxSameBucketSameSide = 2
	}
	if c.Portfolio.MaxTotalSameSide == 0 {
		c.Portfolio.MaxTotalSameSide = 4
	}
	if c.Portfolio.MaxGrossExposurePct == 0 {
		c.Portfolio.MaxGrossExposurePct = 40
	}
	if c.Portfolio.CorrelationBuckets == nil {
		c.Portfolio.CorrelationBuckets = map[string][]string{
			"majors": {"BTCUSDT", "ETHUSDT"},
			"layer1": {"SOLUSDT", "AVAXUSDT", "NEARUSDT", "SUIUSDT", "APTUSDT"},
			"meme":   {"DOGEUSDT", "PEPEUSDT", "WIFUSDT", "BONKUSDT"},
		}
	}
	if c.Limits.DailyLossLimitPct.Demo == 0 {
		c.Limits.DailyLossLimitPct.Demo = 5.0
	}
	if c.Limits.DailyLossLimitPct.Live == 0 {
		c.Limits.DailyLossLimitPct.Live = 2.0
	}
	if c.Limits.MaxConsecutiveLosses.Demo == 0 {
		c.Limits.MaxConsecutiveLosses.Demo = 5
	}
	if c.Limits.MaxConsecutiveLosses.Live == 0 {
		c.Limits.MaxConsecutiveLosses.Live = 3
	}
	if c.Limits.LossCooldownHours == 0 {
		c.Limits.LossCooldownHours = 12
	}
	if c.Live.MinScore == 0 {
		c.Live.MinScore = 75
	}
}

func (c Config) stopsForSetup(setup string) SetupStops {
	base := SetupStops{
		SLATRMult: c.Stops.SLATRMult,
		TPATRMult: c.Stops.TPATRMult,
		MinRR:     c.Stops.MinRR,
	}
	if ov, ok := c.Stops.BySetup[setup]; ok {
		if ov.SLATRMult > 0 {
			base.SLATRMult = ov.SLATRMult
		}
		if ov.TPATRMult > 0 {
			base.TPATRMult = ov.TPATRMult
		}
		if ov.MinRR > 0 {
			base.MinRR = ov.MinRR
		}
	}
	return base
}

func (c Config) leverageForSetup(setup string) int {
	if lev, ok := c.Leverage.BySetup[setup]; ok && lev > 0 {
		return lev
	}
	return 5
}

func (c Config) maxOpenPositions(mode TradingMode) int {
	if mode == ModeLive {
		return c.Portfolio.MaxOpenPositions.Live
	}
	return c.Portfolio.MaxOpenPositions.Demo
}

func (c Config) dailyLossLimit(mode TradingMode) float64 {
	if mode == ModeLive {
		return c.Limits.DailyLossLimitPct.Live
	}
	return c.Limits.DailyLossLimitPct.Demo
}

func (c Config) maxConsecutiveLosses(mode TradingMode) int {
	if mode == ModeLive {
		return c.Limits.MaxConsecutiveLosses.Live
	}
	return c.Limits.MaxConsecutiveLosses.Demo
}

package config

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

type SymbolOverride struct {
	PriceVolPct      *float64 `yaml:"price_vol_pct"`
	VolumeSpikeRatio *float64 `yaml:"volume_spike_ratio"`
	OIJumpPct        *float64 `yaml:"oi_jump_pct"`
}

type Thresholds struct {
	VolumeSpikeRatio  float64 `yaml:"volume_spike_ratio"`
	OIJumpPct         float64 `yaml:"oi_jump_pct"`
	PriceVolPct       float64 `yaml:"price_vol_pct"`
	MinScore          int     `yaml:"min_score"`
	MaxSpreadPct      float64 `yaml:"max_spread_pct"`
	BTCCorrelationPct float64 `yaml:"btc_correlation_pct"`
	FundingExtremePct float64 `yaml:"funding_extreme_pct"`
}

type ScoringWeights struct {
	VolumeWeight      int `yaml:"volume_weight"`
	OIWeight          int `yaml:"oi_weight"`
	PriceWeight       int `yaml:"price_weight"`
	OrderflowWeight   int `yaml:"orderflow_weight"`
	BTCDecoupleWeight int `yaml:"btc_decouple_weight"`
}

type PaperConfig struct {
	Enabled     bool    `yaml:"enabled"`
	SlippagePct float64 `yaml:"slippage_pct"`
	TPATRMult   float64 `yaml:"tp_atr_mult"`
	SLATRMult   float64 `yaml:"sl_atr_mult"`
}

type DigestConfig struct {
	Enabled     bool `yaml:"enabled"`
	IntervalMin int  `yaml:"interval_min"`
}

type RiskSetupStops struct {
	SLATRMult float64 `yaml:"sl_atr_mult"`
	TPATRMult float64 `yaml:"tp_atr_mult"`
	MinRR     float64 `yaml:"min_rr"`
}

type RiskAccountConfig struct {
	DemoEquityUSDT float64 `yaml:"demo_equity_usdt"`
	LiveEquityUSDT float64 `yaml:"live_equity_usdt"`
	AccountRiskPct float64 `yaml:"account_risk_pct"`
	ScoreFactorMin float64 `yaml:"score_factor_min"`
}

type RiskSizingConfig struct {
	VolRefRatio       float64 `yaml:"vol_ref_ratio"`
	VolFactorMin      float64 `yaml:"vol_factor_min"`
	ATRRefPct         float64 `yaml:"atr_ref_pct"`
	ATRFactorMin      float64 `yaml:"atr_factor_min"`
	MaxNotionalUSDT   float64 `yaml:"max_notional_usdt"`
	MaxNotionalPct    float64 `yaml:"max_notional_pct"`
	MaxMarginUsagePct float64 `yaml:"max_margin_usage_pct"`
}

type RiskStopsConfig struct {
	Method             string                    `yaml:"method"`
	StructureLookback  int                       `yaml:"structure_lookback"`
	StructureBufferPct float64                   `yaml:"structure_buffer_pct"`
	MinSLDistancePct   float64                   `yaml:"min_sl_distance_pct"`
	MinRR              float64                   `yaml:"min_rr"`
	MaxTPATRMult       float64                   `yaml:"max_tp_atr_mult"`
	SLATRMult          float64                   `yaml:"sl_atr_mult"`
	TPATRMult          float64                   `yaml:"tp_atr_mult"`
	BySetup            map[string]RiskSetupStops `yaml:"by_setup"`
}

type RiskLeverageConfig struct {
	Min               int            `yaml:"min"`
	Max               int            `yaml:"max"`
	ATRRefPct         float64        `yaml:"atr_ref_pct"`
	LiqBufferMult     float64        `yaml:"liq_buffer_mult"`
	MaxSLToLiqRatio   float64        `yaml:"max_sl_to_liq_ratio"`
	MinSLLiqBufferPct float64        `yaml:"min_sl_liq_buffer_pct"`
	BySetup           map[string]int `yaml:"by_setup"`
}

type RiskModeLimits struct {
	Demo int `yaml:"demo"`
	Live int `yaml:"live"`
}

type RiskModeFloatLimits struct {
	Demo float64 `yaml:"demo"`
	Live float64 `yaml:"live"`
}

type RiskPortfolioConfig struct {
	MaxOpenPositions      RiskModeLimits      `yaml:"max_open_positions"`
	MaxSameBucketSameSide int                 `yaml:"max_same_bucket_same_side"`
	MaxTotalSameSide      int                 `yaml:"max_total_same_side"`
	MaxGrossExposurePct   float64             `yaml:"max_gross_exposure_pct"`
	CorrelationBuckets    map[string][]string `yaml:"correlation_buckets"`
}

type RiskLimitsConfig struct {
	DailyLossLimitPct    RiskModeFloatLimits `yaml:"daily_loss_limit_pct"`
	MaxConsecutiveLosses RiskModeLimits      `yaml:"max_consecutive_losses"`
	LossCooldownHours    int                 `yaml:"loss_cooldown_hours"`
}

type RiskDemoConfig struct {
	BadgeAlerts       bool `yaml:"badge_alerts"`
	SeparateJournal   bool `yaml:"separate_journal"`
	AllowOnKillSwitch bool `yaml:"allow_on_kill_switch"`
}

type RiskLiveConfig struct {
	RequireExplicitEnable bool `yaml:"require_explicit_enable"`
	MinScore              int  `yaml:"min_score"`
}

type RiskConfig struct {
	Enabled   bool                `yaml:"enabled"`
	Account   RiskAccountConfig   `yaml:"account"`
	Sizing    RiskSizingConfig    `yaml:"sizing"`
	Stops     RiskStopsConfig     `yaml:"stops"`
	Leverage  RiskLeverageConfig  `yaml:"leverage"`
	Portfolio RiskPortfolioConfig `yaml:"portfolio"`
	Limits    RiskLimitsConfig    `yaml:"limits"`
	Demo      RiskDemoConfig      `yaml:"demo"`
	Live      RiskLiveConfig      `yaml:"live"`
}

type StrategyConfig struct {
	Enabled               bool    `yaml:"enabled"`
	ConfirmMinSec         int     `yaml:"confirm_min_sec"`
	ConfirmMaxSec         int     `yaml:"confirm_max_sec"`
	FastConfirmMinSec     int     `yaml:"fast_confirm_min_sec"`
	FastConfirmMaxSec     int     `yaml:"fast_confirm_max_sec"`
	FastMinScore          int     `yaml:"fast_min_score"`
	DataFreshSec          int     `yaml:"data_fresh_sec"`
	MinVol1mUSDT          float64 `yaml:"min_vol_1m_usdt"`
	MinPriceChangePct     float64 `yaml:"min_price_change_pct"`
	MinScoreImpulse       int     `yaml:"min_score_impulse"`
	MinScoreConfirmed     int     `yaml:"min_score_confirmed"`
	MinScoreHot           int     `yaml:"min_score_hot"`
	MinTriggersConfirmed  int     `yaml:"min_triggers_confirmed"`
	FadeRetracePct        float64 `yaml:"fade_retrace_pct"`
	FadeEnabled           bool    `yaml:"fade_enabled"`
	RequireOrderflowAlign bool    `yaml:"require_orderflow_align"`
	ImpulseAlerts         bool    `yaml:"impulse_alerts"`
	HotBypassConfirm      bool    `yaml:"hot_bypass_confirm"`
}

// IndicatorMTFConfig drives the 5-indicator 5m/15m volume strategy (Oleg).
type IndicatorMTFConfig struct {
	Enabled           bool    `yaml:"enabled"`
	MinBars           int     `yaml:"min_bars"`
	MinVolumeUSDT5m   float64 `yaml:"min_volume_usdt_5m"`
	MinIndicatorVotes int     `yaml:"min_indicator_votes"`
	MinConfirm15m     int     `yaml:"min_confirm_15m"`
	MaxSpreadPct      float64 `yaml:"max_spread_pct"`
	RSIPeriod         int     `yaml:"rsi_period"`
	CooldownSec       int     `yaml:"cooldown_sec"`
}

// MomentumScalperConfig is an isolated, fail-closed Tier A pipeline. It does
// not alter legacy detector or FADE behaviour.
type MomentumScalperConfig struct {
	Enabled               bool     `yaml:"enabled"`
	PaperOnly             bool     `yaml:"paper_only"`
	Symbols               []string `yaml:"symbols"`
	FreshnessMS           int      `yaml:"freshness_ms"`
	MinPriceChangePct     float64  `yaml:"min_price_change_pct"`
	MinOrderflowUSDT      float64  `yaml:"min_orderflow_usdt"`
	MinOIChangePct        float64  `yaml:"min_oi_change_pct"`
	MaxSpreadPct          float64  `yaml:"max_spread_pct"`
	RequireOrderbook      bool     `yaml:"require_orderbook"`
	OrderbookMaxAgeMS     int      `yaml:"orderbook_max_age_ms"`
	OrderbookMinDepthUSDT float64  `yaml:"orderbook_min_depth_usdt"`
	CooldownSec           int      `yaml:"cooldown_sec"`
}

// MarketContextConfig controls observational market-context features. They
// remain shadow-only: enabling them never changes existing execution rules.
type MarketContextConfig struct {
	Enabled   bool            `yaml:"enabled"`
	Orderbook OrderbookConfig `yaml:"orderbook"`
}

// OrderbookConfig is deliberately opt-in. The allow-list must contain only
// symbols that have already passed the runtime Tier A classifier; no broad
// universe subscription is permitted.
type OrderbookConfig struct {
	Enabled  bool     `yaml:"enabled"`
	Symbols  []string `yaml:"symbols"`
	MaxAgeMS int      `yaml:"max_age_ms"`
}

type TradersConfig struct {
	Enabled             bool                `yaml:"enabled"`
	EquityPerTraderUSDT float64             `yaml:"equity_per_trader_usdt"`
	Profiles            []TraderProfileYAML `yaml:"profiles"`
}

type CarryConfig struct {
	Enabled               bool    `yaml:"enabled"`
	PaperEnabled          bool    `yaml:"paper_enabled"`
	MinNetCarryBps        float64 `yaml:"min_net_carry_bps"`
	FeeBpsPerLeg          float64 `yaml:"fee_bps_per_leg"`
	SlippageBpsPerLeg     float64 `yaml:"slippage_bps_per_leg"`
	FundingUncertaintyBps float64 `yaml:"funding_uncertainty_bps"`
	MaxHoldingMinutes     int     `yaml:"max_holding_minutes"`
	MaxUnhedgedSeconds    int     `yaml:"max_unhedged_seconds"`
}

type PromotionConfig struct {
	MinClosedTrades      int     `yaml:"min_closed_trades"`
	MinProfitFactor      float64 `yaml:"min_profit_factor"`
	MinExpectancyR       float64 `yaml:"min_expectancy_r"`
	MaxDrawdownUSDT      float64 `yaml:"max_drawdown_usdt"`
	MaxExecutionFailures int     `yaml:"max_execution_failures"`
}

// PerformanceGatesConfig only controls reporting eligibility. It is not read
// by execution code and defaults every new setup to shadow/paper.
type PerformanceGatesConfig struct {
	Enabled              bool    `yaml:"enabled"`
	MinimumIndependent   int     `yaml:"minimum_independent"`
	MinimumExpectancyBps float64 `yaml:"minimum_expectancy_bps"`
	MinimumProfitFactor  float64 `yaml:"minimum_profit_factor"`
	MaximumDrawdownBps   float64 `yaml:"maximum_drawdown_bps"`
	MaximumMissingRate   float64 `yaml:"maximum_missing_rate"`
	DemoEligible         bool    `yaml:"demo_eligible"`
}

// TrainingConfig controls audit-only dataset collection. It is intentionally
// absent from strategy, execution, and risk configuration.
type TrainingConfig struct {
	Enabled        bool    `yaml:"enabled"`
	FeatureVersion string  `yaml:"feature_version"`
	LabelVersion   string  `yaml:"label_version"`
	CostVersion    string  `yaml:"cost_version"`
	EntryFeeBps    float64 `yaml:"entry_fee_bps"`
	ExitFeeBps     float64 `yaml:"exit_fee_bps"`
	SlippageBps    float64 `yaml:"slippage_bps"`
}

// AdaptiveExitConfig applies only to bot-owned Bybit Demo positions. R values
// are expressed in multiples of the original entry-to-stop risk.
type AdaptiveExitConfig struct {
	Enabled              bool    `yaml:"enabled"`
	BreakevenAtR         float64 `yaml:"breakeven_at_r"`
	BreakevenLockR       float64 `yaml:"breakeven_lock_r"`
	TrailStartR          float64 `yaml:"trail_start_r"`
	TrailDistanceR       float64 `yaml:"trail_distance_r"`
	MinStopStepR         float64 `yaml:"min_stop_step_r"`
	TPExtendAtR          float64 `yaml:"tp_extend_at_r"`
	TPExtendToR          float64 `yaml:"tp_extend_to_r"`
	MinUpdateIntervalSec int     `yaml:"min_update_interval_sec"`
}

type TraderProfileYAML struct {
	ID               string  `yaml:"id"`
	Name             string  `yaml:"name"`
	Emoji            string  `yaml:"emoji"`
	Description      string  `yaml:"description"`
	MinScore         int     `yaml:"min_score"`
	MinVol1mUSDT     float64 `yaml:"min_vol_1m_usdt"`
	MinTriggers      int     `yaml:"min_triggers"`
	AllowFade        bool    `yaml:"allow_fade"`
	AllowHotOnly     bool    `yaml:"allow_hot_only"`
	LeverageMax      int     `yaml:"leverage_max"`
	RiskMult         float64 `yaml:"risk_mult"`
	MaxOpen          int     `yaml:"max_open"`
	MinRR            float64 `yaml:"min_rr"`
	MinSLDistancePct float64 `yaml:"min_sl_distance_pct"`
	MinSLLiqBuffer   float64 `yaml:"min_sl_liq_buffer_pct"`
	TelegramNotify   bool    `yaml:"telegram_notify"`
	MomentumOnly     bool    `yaml:"momentum_only"`
	FadeOnly         bool    `yaml:"fade_only"`
	MaxScore         int     `yaml:"max_score"`
	Strategy         string  `yaml:"strategy"`
	MinTapePoints    int     `yaml:"min_tape_points"`
	MaxNotionalUSDT  float64 `yaml:"max_notional_usdt"`
	ExecutionMode    string  `yaml:"execution_mode"`
	InvertSignals    bool    `yaml:"invert_signals"`
	AdaptiveLearn    bool    `yaml:"adaptive_learn"`
	MaxTradesPerDay  int     `yaml:"max_trades_per_day"`
	MaxSpreadPct     float64 `yaml:"max_spread_pct"`
	EquityUSDT       float64 `yaml:"equity_usdt"`
}

type YAMLConfig struct {
	Thresholds       Thresholds                `yaml:"thresholds"`
	Scoring          ScoringWeights            `yaml:"scoring"`
	Symbols          map[string]SymbolOverride `yaml:"symbols"`
	Blacklist        []string                  `yaml:"blacklist"`
	Whitelist        []string                  `yaml:"whitelist"`
	Paper            PaperConfig               `yaml:"paper"`
	Digest           DigestConfig              `yaml:"digest"`
	Risk             RiskConfig                `yaml:"risk"`
	Strategy         StrategyConfig            `yaml:"strategy"`
	MomentumScalper  MomentumScalperConfig     `yaml:"momentum_scalper"`
	IndicatorMTF     IndicatorMTFConfig        `yaml:"indicator_mtf"`
	MarketContext    MarketContextConfig       `yaml:"market_context"`
	Carry            CarryConfig               `yaml:"carry"`
	Promotion        PromotionConfig           `yaml:"promotion"`
	PerformanceGates PerformanceGatesConfig    `yaml:"performance_gates"`
	Training         TrainingConfig            `yaml:"training"`
	AdaptiveExit     AdaptiveExitConfig        `yaml:"adaptive_exit"`
	Traders          TradersConfig             `yaml:"traders"`
	Telegram         TelegramNotifyConfig      `yaml:"telegram"`
}

type TelegramNotifyConfig struct {
	MinNotifyScore int `yaml:"min_notify_score"`
}

type Config struct {
	mu sync.RWMutex

	TelegramBotToken string
	TelegramChatID   int64
	DryRun           bool
	MinVolume24H     float64
	AlertCooldown    time.Duration
	LogDir           string
	BybitRESTURL     string
	BybitWSURL       string
	ConfigPath       string
	SymbolsFile      string
	OIPollInterval   time.Duration
	LSPollInterval   time.Duration
	WSShardSize      int
	ConfigReload     time.Duration

	staticSymbols     []string
	useDefaultSymbols bool
	telegramMinNotify int
	YAML              YAMLConfig
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		TelegramBotToken:  os.Getenv("TELEGRAM_BOT_TOKEN"),
		DryRun:            envBool("DRY_RUN", false),
		MinVolume24H:      envFloat("MIN_VOLUME_24H", 10_000_000),
		AlertCooldown:     time.Duration(envInt("ALERT_COOLDOWN_MIN", 10)) * time.Minute,
		LogDir:            envString("LOG_DIR", "logs"),
		BybitRESTURL:      envString("BYBIT_REST_URL", "https://api.bybit.com"),
		BybitWSURL:        envString("BYBIT_WS_URL", "wss://stream.bybit.com/v5/public/linear"),
		ConfigPath:        envString("CONFIG_PATH", "config.yaml"),
		SymbolsFile:       envString("SYMBOLS_FILE", "symbols.list"),
		OIPollInterval:    time.Duration(envInt("OI_POLL_SEC", 10)) * time.Second,
		LSPollInterval:    time.Duration(envInt("LS_POLL_SEC", 60)) * time.Second,
		WSShardSize:       30,
		ConfigReload:      5 * time.Minute,
		useDefaultSymbols: envBool("USE_DEFAULT_SYMBOLS", true),
	}

	chatIDStr := os.Getenv("TELEGRAM_CHAT_ID")
	if chatIDStr != "" {
		id, err := strconv.ParseInt(chatIDStr, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid TELEGRAM_CHAT_ID: %w", err)
		}
		cfg.TelegramChatID = id
	}

	if err := cfg.loadYAML(); err != nil {
		return nil, err
	}
	cfg.applyTelegramNotifyOverride()

	if err := cfg.parseStaticSymbols(); err != nil {
		return nil, err
	}

	if !cfg.DryRun {
		if cfg.TelegramBotToken == "" {
			return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is required when DRY_RUN=false")
		}
	}

	return cfg, nil
}

func (c *Config) parseStaticSymbols() error {
	raw := os.Getenv("SYMBOLS")
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	for _, p := range parts {
		s := strings.TrimSpace(strings.ToUpper(p))
		if s != "" {
			c.staticSymbols = append(c.staticSymbols, s)
		}
	}
	return nil
}

func (c *Config) StaticSymbols() []string {
	if len(c.staticSymbols) == 0 {
		return nil
	}
	out := make([]string, len(c.staticSymbols))
	copy(out, c.staticSymbols)
	return out
}

func (c *Config) UseDefaultSymbols() bool {
	return c.useDefaultSymbols
}

func (c *Config) loadYAML() error {
	data, err := os.ReadFile(c.ConfigPath)
	if err != nil {
		return fmt.Errorf("read config %s: %w", c.ConfigPath, err)
	}
	var yc YAMLConfig
	if err := yaml.Unmarshal(data, &yc); err != nil {
		return fmt.Errorf("parse config yaml: %w", err)
	}
	applyYAMLDefaults(&yc)
	if err := validateYAML(&yc); err != nil {
		return fmt.Errorf("invalid config yaml: %w", err)
	}
	c.mu.Lock()
	c.YAML = yc
	c.mu.Unlock()
	return nil
}

func (c *Config) ReloadLoop(ctx context.Context) {
	ticker := time.NewTicker(c.ConfigReload)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.loadYAML(); err == nil {
				c.applyTelegramNotifyOverride()
			}
		}
	}
}

func (c *Config) Snapshot() YAMLConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.YAML
}

func (c *Config) TelegramMinNotifyScore() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.telegramMinNotify > 0 {
		return c.telegramMinNotify
	}
	return c.YAML.Telegram.MinNotifyScore
}

func (c *Config) applyTelegramNotifyOverride() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v := envInt("TELEGRAM_MIN_SCORE", 0); v > 0 {
		c.telegramMinNotify = v
		return
	}
	c.telegramMinNotify = c.YAML.Telegram.MinNotifyScore
}

func (c *Config) IsBlacklisted(symbol string) bool {
	y := c.Snapshot()
	for _, s := range y.Blacklist {
		if s == symbol {
			return true
		}
	}
	return false
}

func (c *Config) IsAllowed(symbol string) bool {
	y := c.Snapshot()
	if len(y.Whitelist) == 0 {
		return true
	}
	for _, s := range y.Whitelist {
		if s == symbol {
			return true
		}
	}
	return false
}

func (c *Config) ThresholdsFor(symbol string) Thresholds {
	y := c.Snapshot()
	t := y.Thresholds
	if ov, ok := y.Symbols[symbol]; ok {
		if ov.PriceVolPct != nil {
			t.PriceVolPct = *ov.PriceVolPct
		}
		if ov.VolumeSpikeRatio != nil {
			t.VolumeSpikeRatio = *ov.VolumeSpikeRatio
		}
		if ov.OIJumpPct != nil {
			t.OIJumpPct = *ov.OIJumpPct
		}
	}
	return t
}

func applyYAMLDefaults(y *YAMLConfig) {
	if y.Thresholds.VolumeSpikeRatio == 0 {
		y.Thresholds.VolumeSpikeRatio = 4.0
	}
	if y.Thresholds.OIJumpPct == 0 {
		y.Thresholds.OIJumpPct = 2.5
	}
	if y.Thresholds.PriceVolPct == 0 {
		y.Thresholds.PriceVolPct = 3.0
	}
	if y.Thresholds.MinScore == 0 {
		y.Thresholds.MinScore = 70
	}
	if y.Thresholds.MaxSpreadPct == 0 {
		y.Thresholds.MaxSpreadPct = 0.15
	}
	if y.Thresholds.BTCCorrelationPct == 0 {
		y.Thresholds.BTCCorrelationPct = 1.0
	}
	if y.Thresholds.FundingExtremePct == 0 {
		y.Thresholds.FundingExtremePct = 0.05
	}
	if y.Scoring.VolumeWeight == 0 {
		y.Scoring.VolumeWeight = 30
	}
	if y.Scoring.OIWeight == 0 {
		y.Scoring.OIWeight = 25
	}
	if y.Scoring.PriceWeight == 0 {
		y.Scoring.PriceWeight = 25
	}
	if y.Scoring.OrderflowWeight == 0 {
		y.Scoring.OrderflowWeight = 10
	}
	if y.Scoring.BTCDecoupleWeight == 0 {
		y.Scoring.BTCDecoupleWeight = 10
	}
	if y.Paper.SlippagePct == 0 {
		y.Paper.SlippagePct = 0.05
	}
	if y.Paper.TPATRMult == 0 {
		y.Paper.TPATRMult = 2.0
	}
	if y.Paper.SLATRMult == 0 {
		y.Paper.SLATRMult = 1.0
	}
	if y.Digest.IntervalMin == 0 {
		y.Digest.IntervalMin = 60
	}
	if y.Strategy.ConfirmMinSec == 0 {
		y.Strategy.ConfirmMinSec = 30
	}
	if y.Strategy.ConfirmMaxSec == 0 {
		y.Strategy.ConfirmMaxSec = 120
	}
	if y.Strategy.FastConfirmMinSec == 0 {
		y.Strategy.FastConfirmMinSec = 5
	}
	if y.Strategy.FastConfirmMaxSec == 0 {
		y.Strategy.FastConfirmMaxSec = 20
	}
	if y.Strategy.FastMinScore == 0 {
		y.Strategy.FastMinScore = 80
	}
	if y.Strategy.DataFreshSec == 0 {
		y.Strategy.DataFreshSec = 2
	}
	if y.Strategy.MinVol1mUSDT == 0 {
		y.Strategy.MinVol1mUSDT = 30_000
	}
	if y.Strategy.MinPriceChangePct == 0 {
		y.Strategy.MinPriceChangePct = 0.25
	}
	if y.Strategy.MinScoreImpulse == 0 {
		y.Strategy.MinScoreImpulse = 65
	}
	if y.Strategy.MinScoreConfirmed == 0 {
		y.Strategy.MinScoreConfirmed = 70
	}
	if y.Strategy.MinScoreHot == 0 {
		y.Strategy.MinScoreHot = 85
	}
	if y.Strategy.MinTriggersConfirmed == 0 {
		y.Strategy.MinTriggersConfirmed = 2
	}
	if y.Strategy.FadeRetracePct == 0 {
		y.Strategy.FadeRetracePct = 45
	}
	if len(y.MomentumScalper.Symbols) == 0 {
		y.MomentumScalper.Symbols = []string{"BTCUSDT", "ETHUSDT", "SOLUSDT"}
	}
	if y.MomentumScalper.FreshnessMS == 0 {
		y.MomentumScalper.FreshnessMS = 1_500
	}
	if y.MomentumScalper.MinPriceChangePct == 0 {
		y.MomentumScalper.MinPriceChangePct = 0.20
	}
	if y.MomentumScalper.MinOrderflowUSDT == 0 {
		y.MomentumScalper.MinOrderflowUSDT = 50_000
	}
	if y.MomentumScalper.MinOIChangePct == 0 {
		y.MomentumScalper.MinOIChangePct = 0.15
	}
	if y.MomentumScalper.MaxSpreadPct == 0 {
		y.MomentumScalper.MaxSpreadPct = 0.05
	}
	if y.MomentumScalper.OrderbookMaxAgeMS == 0 {
		y.MomentumScalper.OrderbookMaxAgeMS = 1_000
	}
	if y.MomentumScalper.OrderbookMinDepthUSDT == 0 {
		y.MomentumScalper.OrderbookMinDepthUSDT = 100_000
	}
	if y.MomentumScalper.CooldownSec == 0 {
		y.MomentumScalper.CooldownSec = 30
	}
	if y.IndicatorMTF.MinBars == 0 {
		y.IndicatorMTF.MinBars = 30
	}
	if y.IndicatorMTF.MinVolumeUSDT5m == 0 {
		y.IndicatorMTF.MinVolumeUSDT5m = 30_000
	}
	if y.IndicatorMTF.MinIndicatorVotes == 0 {
		y.IndicatorMTF.MinIndicatorVotes = 4
	}
	if y.IndicatorMTF.MinConfirm15m == 0 {
		y.IndicatorMTF.MinConfirm15m = 3
	}
	if y.IndicatorMTF.MaxSpreadPct == 0 {
		y.IndicatorMTF.MaxSpreadPct = 0.12
	}
	if y.IndicatorMTF.RSIPeriod == 0 {
		y.IndicatorMTF.RSIPeriod = 14
	}
	if y.IndicatorMTF.CooldownSec == 0 {
		y.IndicatorMTF.CooldownSec = 120
	}
	if y.MarketContext.Orderbook.MaxAgeMS == 0 {
		y.MarketContext.Orderbook.MaxAgeMS = 2_000
	}
	if y.Carry.MinNetCarryBps == 0 {
		y.Carry.MinNetCarryBps = 25
	}
	if y.Carry.FeeBpsPerLeg == 0 {
		y.Carry.FeeBpsPerLeg = 10
	}
	if y.Carry.SlippageBpsPerLeg == 0 {
		y.Carry.SlippageBpsPerLeg = 5
	}
	if y.Carry.FundingUncertaintyBps == 0 {
		y.Carry.FundingUncertaintyBps = 10
	}
	if y.Carry.MaxHoldingMinutes == 0 {
		y.Carry.MaxHoldingMinutes = 480
	}
	if y.Carry.MaxUnhedgedSeconds == 0 {
		y.Carry.MaxUnhedgedSeconds = 3
	}
	if y.Promotion.MinClosedTrades == 0 {
		y.Promotion.MinClosedTrades = 100
	}
	if y.Promotion.MinProfitFactor == 0 {
		y.Promotion.MinProfitFactor = 1.1
	}
	if y.Promotion.MaxDrawdownUSDT == 0 {
		y.Promotion.MaxDrawdownUSDT = 250
	}
	if y.PerformanceGates.MinimumIndependent == 0 {
		y.PerformanceGates.MinimumIndependent = 100
	}
	if y.PerformanceGates.MinimumProfitFactor == 0 {
		y.PerformanceGates.MinimumProfitFactor = 1.1
	}
	if y.PerformanceGates.MaximumMissingRate == 0 {
		y.PerformanceGates.MaximumMissingRate = 0.05
	}
	if y.Training.FeatureVersion == "" {
		y.Training.FeatureVersion = "training-features/v1"
	}
	if y.Training.LabelVersion == "" {
		y.Training.LabelVersion = "outcome-label/v1"
	}
	if y.AdaptiveExit.BreakevenAtR == 0 {
		y.AdaptiveExit.BreakevenAtR = 1
	}
	if y.AdaptiveExit.TrailStartR == 0 {
		y.AdaptiveExit.TrailStartR = 1.5
	}
	if y.AdaptiveExit.TrailDistanceR == 0 {
		y.AdaptiveExit.TrailDistanceR = 0.75
	}
	if y.AdaptiveExit.MinStopStepR == 0 {
		y.AdaptiveExit.MinStopStepR = 0.1
	}
	if y.AdaptiveExit.TPExtendAtR == 0 {
		y.AdaptiveExit.TPExtendAtR = 1.8
	}
	if y.AdaptiveExit.TPExtendToR == 0 {
		y.AdaptiveExit.TPExtendToR = 2.5
	}
	if y.AdaptiveExit.MinUpdateIntervalSec == 0 {
		y.AdaptiveExit.MinUpdateIntervalSec = 15
	}
}

func validateYAML(y *YAMLConfig) error {
	t := y.Training
	if t.Enabled {
		if strings.TrimSpace(t.CostVersion) == "" {
			return fmt.Errorf("training.cost_version is required when training is enabled")
		}
		if t.EntryFeeBps < 0 || t.ExitFeeBps < 0 || t.SlippageBps < 0 {
			return fmt.Errorf("training cost values must be non-negative bps")
		}
		if t.EntryFeeBps+t.ExitFeeBps+2*t.SlippageBps <= 0 {
			return fmt.Errorf("training costs must be positive; zero-cost labels are unsafe")
		}
	}
	p := y.AdaptiveExit
	if p.BreakevenAtR < 0 || p.BreakevenLockR < 0 || p.TrailStartR < 0 ||
		p.TrailDistanceR < 0 || p.MinStopStepR < 0 || p.TPExtendAtR < 0 ||
		p.TPExtendToR < 0 || p.MinUpdateIntervalSec < 0 {
		return fmt.Errorf("adaptive_exit values must be non-negative")
	}
	if p.TrailDistanceR == 0 {
		return fmt.Errorf("adaptive_exit.trail_distance_r must be positive")
	}
	if p.MinStopStepR == 0 {
		return fmt.Errorf("adaptive_exit.min_stop_step_r must be positive")
	}
	if p.MinUpdateIntervalSec == 0 {
		return fmt.Errorf("adaptive_exit.min_update_interval_sec must be positive")
	}
	if p.TPExtendToR < p.TPExtendAtR {
		return fmt.Errorf("adaptive_exit.tp_extend_to_r must be at least tp_extend_at_r")
	}
	m := y.MomentumScalper
	if m.FreshnessMS <= 0 || m.MinPriceChangePct <= 0 || m.MinOrderflowUSDT <= 0 ||
		m.MinOIChangePct <= 0 || m.MaxSpreadPct <= 0 || m.CooldownSec <= 0 {
		return fmt.Errorf("momentum_scalper thresholds must be positive")
	}
	if m.RequireOrderbook && (m.OrderbookMaxAgeMS <= 0 || m.OrderbookMinDepthUSDT <= 0) {
		return fmt.Errorf("momentum_scalper required orderbook limits must be positive")
	}
	g := y.PerformanceGates
	if g.MinimumIndependent <= 0 || g.MinimumProfitFactor <= 0 || g.MaximumMissingRate < 0 || g.MaximumMissingRate > 1 {
		return fmt.Errorf("performance_gates has invalid evidence thresholds")
	}
	return nil
}

func envString(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func envFloat(key string, fallback float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return f
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}

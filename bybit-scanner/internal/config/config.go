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
	VolumeWeight     int `yaml:"volume_weight"`
	OIWeight         int `yaml:"oi_weight"`
	PriceWeight      int `yaml:"price_weight"`
	OrderflowWeight  int `yaml:"orderflow_weight"`
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
	Method             string                      `yaml:"method"`
	StructureLookback  int                         `yaml:"structure_lookback"`
	StructureBufferPct float64                     `yaml:"structure_buffer_pct"`
	MinSLDistancePct   float64                     `yaml:"min_sl_distance_pct"`
	MinRR              float64                     `yaml:"min_rr"`
	MaxTPATRMult       float64                     `yaml:"max_tp_atr_mult"`
	SLATRMult          float64                     `yaml:"sl_atr_mult"`
	TPATRMult          float64                     `yaml:"tp_atr_mult"`
	BySetup            map[string]RiskSetupStops   `yaml:"by_setup"`
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
	MaxOpenPositions      RiskModeLimits          `yaml:"max_open_positions"`
	MaxSameBucketSameSide int                     `yaml:"max_same_bucket_same_side"`
	MaxTotalSameSide      int                     `yaml:"max_total_same_side"`
	MaxGrossExposurePct   float64                 `yaml:"max_gross_exposure_pct"`
	CorrelationBuckets    map[string][]string     `yaml:"correlation_buckets"`
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
	MinVol1mUSDT          float64 `yaml:"min_vol_1m_usdt"`
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

type TradersConfig struct {
	Enabled              bool                `yaml:"enabled"`
	EquityPerTraderUSDT  float64             `yaml:"equity_per_trader_usdt"`
	Profiles             []TraderProfileYAML `yaml:"profiles"`
}

type TraderProfileYAML struct {
	ID             string  `yaml:"id"`
	Name           string  `yaml:"name"`
	Emoji          string  `yaml:"emoji"`
	Description    string  `yaml:"description"`
	MinScore       int     `yaml:"min_score"`
	MinVol1mUSDT   float64 `yaml:"min_vol_1m_usdt"`
	MinTriggers    int     `yaml:"min_triggers"`
	AllowFade      bool    `yaml:"allow_fade"`
	AllowHotOnly   bool    `yaml:"allow_hot_only"`
	LeverageMax    int     `yaml:"leverage_max"`
	RiskMult       float64 `yaml:"risk_mult"`
	MaxOpen        int     `yaml:"max_open"`
	MinRR          float64 `yaml:"min_rr"`
	MinSLDistancePct float64 `yaml:"min_sl_distance_pct"`
	MinSLLiqBuffer float64 `yaml:"min_sl_liq_buffer_pct"`
	TelegramNotify bool    `yaml:"telegram_notify"`
	MomentumOnly   bool    `yaml:"momentum_only"`
	FadeOnly       bool    `yaml:"fade_only"`
	MaxScore       int     `yaml:"max_score"`
	Strategy       string  `yaml:"strategy"`
	MinTapePoints  int     `yaml:"min_tape_points"`
	MaxNotionalUSDT float64 `yaml:"max_notional_usdt"`
}

type YAMLConfig struct {
	Thresholds Thresholds                `yaml:"thresholds"`
	Scoring    ScoringWeights            `yaml:"scoring"`
	Symbols    map[string]SymbolOverride `yaml:"symbols"`
	Blacklist  []string                  `yaml:"blacklist"`
	Whitelist  []string                  `yaml:"whitelist"`
	Paper      PaperConfig               `yaml:"paper"`
	Digest     DigestConfig              `yaml:"digest"`
	Risk       RiskConfig                `yaml:"risk"`
	Strategy   StrategyConfig            `yaml:"strategy"`
	Traders    TradersConfig             `yaml:"traders"`
	Telegram   TelegramNotifyConfig      `yaml:"telegram"`
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

	staticSymbols      []string
	useDefaultSymbols  bool
	telegramMinNotify  int
	YAML               YAMLConfig
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		DryRun:           envBool("DRY_RUN", false),
		MinVolume24H:     envFloat("MIN_VOLUME_24H", 10_000_000),
		AlertCooldown:    time.Duration(envInt("ALERT_COOLDOWN_MIN", 10)) * time.Minute,
		LogDir:           envString("LOG_DIR", "logs"),
		BybitRESTURL:     envString("BYBIT_REST_URL", "https://api.bybit.com"),
		BybitWSURL:       envString("BYBIT_WS_URL", "wss://stream.bybit.com/v5/public/linear"),
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
	if y.Strategy.MinVol1mUSDT == 0 {
		y.Strategy.MinVol1mUSDT = 30_000
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

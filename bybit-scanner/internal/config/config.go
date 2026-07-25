package config

import (
	"fmt"
	"os"
	"strconv"
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

type YAMLConfig struct {
	Thresholds Thresholds                `yaml:"thresholds"`
	Scoring    ScoringWeights            `yaml:"scoring"`
	Symbols    map[string]SymbolOverride `yaml:"symbols"`
	Blacklist  []string                  `yaml:"blacklist"`
	Whitelist  []string                  `yaml:"whitelist"`
	Paper      PaperConfig               `yaml:"paper"`
	Digest     DigestConfig              `yaml:"digest"`
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
	OIPollInterval   time.Duration
	LSPollInterval   time.Duration
	WSShardSize      int
	ConfigReload     time.Duration

	YAML YAMLConfig
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
		ConfigPath:       envString("CONFIG_PATH", "config.yaml"),
		OIPollInterval:   10 * time.Second,
		LSPollInterval:   60 * time.Second,
		WSShardSize:      30,
		ConfigReload:     5 * time.Minute,
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

	if !cfg.DryRun {
		if cfg.TelegramBotToken == "" {
			return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is required when DRY_RUN=false")
		}
	}

	return cfg, nil
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
				// silent reload
			}
		}
	}
}

func (c *Config) Snapshot() YAMLConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.YAML
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

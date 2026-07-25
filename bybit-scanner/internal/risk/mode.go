package risk

import (
	"os"
	"strconv"
	"strings"
)

type RuntimeFlags struct {
	Mode                TradingMode
	LiveTradingEnabled  bool
	DemoEquityUSDT      float64
	LiveEquityUSDT      float64
	KillSwitch          bool
	StatePath           string
}

func LoadRuntimeFlags(yamlDemoEquity float64) RuntimeFlags {
	mode := ModeDemo
	if strings.EqualFold(os.Getenv("TRADING_MODE"), "live") {
		mode = ModeLive
	}

	liveEquity := envFloat("LIVE_EQUITY_USDT", 0)
	demoEquity := envFloat("DEMO_EQUITY_USDT", yamlDemoEquity)
	if demoEquity <= 0 {
		demoEquity = yamlDemoEquity
	}

	return RuntimeFlags{
		Mode:               mode,
		LiveTradingEnabled: envBool("LIVE_TRADING_ENABLED", false),
		DemoEquityUSDT:     demoEquity,
		LiveEquityUSDT:     liveEquity,
		KillSwitch:         envBool("RISK_KILL_SWITCH", false),
		StatePath:          envString("RISK_STATE_PATH", "logs/risk_state.json"),
	}
}

func (f RuntimeFlags) Equity(mode TradingMode, yamlLive float64) float64 {
	if mode == ModeLive {
		if f.LiveEquityUSDT > 0 {
			return f.LiveEquityUSDT
		}
		if yamlLive > 0 {
			return yamlLive
		}
		return 0
	}
	return f.DemoEquityUSDT
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

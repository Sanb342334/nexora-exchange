package execution

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	APIKey       string
	APISecret    string
	BaseURL      string
	AutoTrade    bool
	TestSymbol   string
	TestNotional float64
	RecvWindow   int
}

func LoadConfig() Config {
	notional, _ := strconv.ParseFloat(os.Getenv("DEMO_TEST_NOTIONAL_USDT"), 64)
	if notional <= 0 {
		notional = 100
	}
	recvWindow, _ := strconv.Atoi(os.Getenv("BYBIT_RECV_WINDOW"))
	if recvWindow <= 0 {
		recvWindow = 5000
	}
	sym := strings.TrimSpace(os.Getenv("DEMO_TEST_SYMBOL"))
	if sym == "" {
		sym = "BTCUSDT"
	}
	return Config{
		APIKey:       strings.TrimSpace(os.Getenv("BYBIT_DEMO_API_KEY")),
		APISecret:    strings.TrimSpace(os.Getenv("BYBIT_DEMO_API_SECRET")),
		BaseURL:      strings.TrimRight(envString("BYBIT_DEMO_REST_URL", "https://api-demo.bybit.com"), "/"),
		AutoTrade:    envBool("AUTO_TRADE_DEMO", false),
		TestSymbol:   strings.ToUpper(sym),
		TestNotional: notional,
		RecvWindow:   recvWindow,
	}
}

func (c Config) Ready() bool {
	return c.APIKey != "" && c.APISecret != "" && c.BaseURL != ""
}

func envString(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes"
}

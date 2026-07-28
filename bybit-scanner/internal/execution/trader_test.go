package execution

import (
	"context"
	"strings"
	"testing"
)

func TestRunTestTradeRequiresExplicitDemoAutotradeEnable(t *testing.T) {
	trader := &DemoTrader{
		cfg: Config{
			APIKey:       "demo-key",
			APISecret:    "demo-secret",
			BaseURL:      "https://api-demo.bybit.com",
			AutoTrade:    false,
			TestSymbol:   "BTCUSDT",
			TestNotional: 10,
		},
	}

	_, err := trader.RunTestTrade(context.Background())
	if err == nil || !strings.Contains(err.Error(), "AUTO_TRADE_DEMO=false") {
		t.Fatalf("RunTestTrade error = %v, want explicit autotrade opt-in rejection", err)
	}
}

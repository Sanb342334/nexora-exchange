package momentum

import (
	"testing"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/market"
)

func TestRejectsMissingRequiredFreshInput(t *testing.T) {
	now := time.Date(2026, 7, 28, 10, 0, 0, 0, time.UTC)
	cfg := testConfig()
	engine := NewEngine(cfg)
	state := analyzer.NewStore().Ensure("ETHUSDT")
	state.UpdateKlineAt(analyzer.Candle{Start: now.Add(-20 * time.Second), Open: 100, Close: 101}, now)
	state.UpdateTicker(101, 100.99, 101.01, 0, 0, now)
	state.UpdateTrade("Buy", 100_000, now)
	// OI is deliberately missing: zero must not be treated as neutral.

	decision := engine.Evaluate("ETHUSDT", state, nil, nil, now)
	if decision == nil || !contains(decision.Reasons, "reject:open_interest_stale") {
		t.Fatalf("expected stale OI rejection, got %#v", decision)
	}
}

func TestRequiredOrderbookFailsClosedOnSequenceGap(t *testing.T) {
	now := time.Date(2026, 7, 28, 10, 0, 0, 0, time.UTC)
	cfg := testConfig()
	cfg.YAML.MomentumScalper.RequireOrderbook = true
	engine := NewEngine(cfg)
	state := seededState(now)
	books := market.NewOrderBookStore()
	books.Apply(market.BookUpdate{Symbol: "ETHUSDT", Type: "snapshot", UpdateID: 10, ReceivedAt: now,
		Bids: []market.BookLevel{{Price: 100, Size: 1_000}}, Asks: []market.BookLevel{{Price: 100.01, Size: 1_000}}})
	books.Apply(market.BookUpdate{Symbol: "ETHUSDT", Type: "delta", UpdateID: 12, PrevID: 9, ReceivedAt: now})

	decision := engine.Evaluate("ETHUSDT", state, nil, books, now)
	if decision == nil || !contains(decision.Reasons, "reject:orderbook_stale_or_sequence_gap") {
		t.Fatalf("expected gapped-book rejection, got %#v", decision)
	}
}

func seededState(now time.Time) *analyzer.SymbolState {
	state := analyzer.NewStore().Ensure("ETHUSDT")
	state.UpdateKlineAt(analyzer.Candle{Start: now.Add(-20 * time.Second), Open: 100, Close: 101}, now)
	state.UpdateTicker(101, 100.99, 101.01, 0, 1_000, now.Add(-time.Second))
	state.UpdateOI(998, now.Add(-3*time.Minute))
	state.UpdateOI(1_000, now.Add(-time.Second))
	state.UpdateTrade("Buy", 100_000, now.Add(-time.Second))
	return state
}

func testConfig() *config.Config {
	return &config.Config{YAML: config.YAMLConfig{MomentumScalper: config.MomentumScalperConfig{
		Enabled: true, PaperOnly: true, Symbols: []string{"ETHUSDT"}, FreshnessMS: 1_500,
		MinPriceChangePct: 0.2, MinOrderflowUSDT: 50_000, MinOIChangePct: 0.15,
		MaxSpreadPct: 0.05, OrderbookMaxAgeMS: 1_000, OrderbookMinDepthUSDT: 100_000, CooldownSec: 30,
	}}}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

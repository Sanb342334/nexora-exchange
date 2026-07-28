package quality

import (
	"testing"
	"time"

	"bybit-scanner/internal/analyzer"
)

func TestAssessMarksMissingFeedsUnavailableWithoutPositiveWeight(t *testing.T) {
	now := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	a := NewDefault().Assess(analyzer.Signal{Movement: "PUMP", Timestamp: now}, analyzer.QualitySnapshot{
		Symbol: "SOLUSDT", ObservedAt: now, Price: 100,
	})

	if a.Freshness["ticker"] != Unavailable || a.Freshness["trade_flow"] != Unavailable {
		t.Fatalf("freshness = %#v, want unavailable feeds", a.Freshness)
	}
	if a.Score != 0 {
		t.Fatalf("score = %d, missing data must not earn points", a.Score)
	}
	if !hasVeto(a, "STALE_TICKER") || !hasVeto(a, "STALE_TRADE_FLOW") {
		t.Fatalf("vetoes = %#v", a.Vetoes)
	}
}

func TestAssessFlagsContradictoryFlowAsShadowVeto(t *testing.T) {
	now := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	a := NewDefault().Assess(analyzer.Signal{Movement: "PUMP", PriceChange1m: 1, Timestamp: now}, analyzer.QualitySnapshot{
		Symbol: "SOLUSDT", ObservedAt: now, Price: 100, Bid: 99.9, Ask: 100.1,
		TickerAt: now, TradeAt: now, OIAt: now, KlineAt: now,
		TradeBuyUSDT: 10, TradeSellUSDT: 90, TradeDeltaUSDT: -80,
		OIChange3m: -2, Candle: analyzer.Candle{Start: now, Open: 99, Close: 100, VolumeUSDT: 100},
		NormalizedVolumeUSDT: 100,
	})
	if !hasVeto(a, "FLOW_CONTRADICTION") {
		t.Fatalf("vetoes = %#v, want flow contradiction", a.Vetoes)
	}
	if a.Mode != "SHADOW" {
		t.Fatalf("mode = %q", a.Mode)
	}
}

func TestFreshnessClassifiesStaleSeparately(t *testing.T) {
	now := time.Now().UTC()
	if got := freshness(now.Add(-4*time.Second), now, 3*time.Second); got != Stale {
		t.Fatalf("freshness = %s, want stale", got)
	}
}

func hasVeto(a Assessment, code string) bool {
	for _, veto := range a.Vetoes {
		if veto.Code == code {
			return true
		}
	}
	return false
}

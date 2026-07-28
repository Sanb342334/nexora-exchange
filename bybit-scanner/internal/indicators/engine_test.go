package indicators

import (
	"testing"
	"time"

	"bybit-scanner/internal/analyzer"
)

func TestFiveVotesBullishTrend(t *testing.T) {
	candles := make([]analyzer.Candle, 40)
	price := 100.0
	for i := range candles {
		price += 0.3
		candles[i] = analyzer.Candle{
			Start: time.Now().Add(time.Duration(i) * 5 * time.Minute),
			Open: price - 0.1, High: price + 0.2, Low: price - 0.2, Close: price,
			VolumeUSDT: 50_000 + float64(i)*1000, Confirmed: true,
		}
	}
	votes := fiveVotes(candles, 14)
	if sumVotes(votes) < 2 {
		t.Fatalf("expected bullish vote sum >= 2, got %d", sumVotes(votes))
	}
}

func TestVolumeRatio(t *testing.T) {
	candles := []analyzer.Candle{
		{VolumeUSDT: 10_000, Confirmed: true},
		{VolumeUSDT: 10_000, Confirmed: true},
		{VolumeUSDT: 25_000, Confirmed: true},
	}
	ratio := volumeRatio(candles, 2)
	if ratio < 2.0 {
		t.Fatalf("ratio = %.2f, want >= 2", ratio)
	}
}

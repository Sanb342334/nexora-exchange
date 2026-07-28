package analyzer

import (
	"math"
	"testing"
	"time"
)

func TestSnapshotQualityNormalizesPartialCandleAndKeepsFreshnessTimes(t *testing.T) {
	now := time.Date(2026, 7, 27, 12, 0, 30, 0, time.UTC)
	st := NewStore().Ensure("SOLUSDT")
	st.UpdateKlineAt(Candle{
		Start: now.Add(-30 * time.Second), Open: 100, Close: 101, VolumeUSDT: 50,
	}, now)
	st.UpdateTicker(101, 100.9, 101.1, 0, 1_000, now)
	st.UpdateTrade("Buy", 100, now)

	snapshot := st.SnapshotQuality("SOLUSDT", now)
	if math.Abs(snapshot.NormalizedVolumeUSDT-100) > 0.001 {
		t.Fatalf("normalized volume = %.3f, want 100", snapshot.NormalizedVolumeUSDT)
	}
	if !snapshot.KlineAt.Equal(now) || !snapshot.TickerAt.Equal(now) || !snapshot.TradeAt.Equal(now) {
		t.Fatalf("unexpected freshness timestamps: %#v", snapshot)
	}
}

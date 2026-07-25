package risk

import (
	"path/filepath"
	"testing"
	"time"

	"bybit-scanner/internal/analyzer"
)

func TestStateCloseReleasesPositionAndTracksPnL(t *testing.T) {
	s := NewStateStore(filepath.Join(t.TempDir(), "state.json"))
	s.Register(TradeRecommendation{
		Mode: ModeDemo, Side: SideLong, NotionalUSDT: 100,
		Signal: analyzer.Signal{Symbol: "BTCUSDT"},
		Timestamp: time.Now().UTC(),
	}, "BTC")
	if got := s.OpenCount(ModeDemo); got != 1 {
		t.Fatalf("open count = %d, want 1", got)
	}
	s.Close(ModeDemo, "BTCUSDT", SideLong, -12.5, 0)
	if got := s.OpenCount(ModeDemo); got != 0 {
		t.Fatalf("open count after close = %d, want 0", got)
	}
	if !s.DailyLossBreached(ModeDemo, 100, 10) {
		t.Fatal("daily loss should be breached after -12.5 on $100 with 10% limit")
	}
}

package traders

import (
	"path/filepath"
	"testing"

	"bybit-scanner/internal/analyzer"
)

func TestAdaptiveLearnerTightensOnLossStreak(t *testing.T) {
	dir := t.TempDir()
	l := NewAdaptiveLearner(dir, "misha", true, true, 100)
	for i := 0; i < 30; i++ {
		l.RecordClose(false, analyzer.Signal{AlertType: "FADE", Score: 45})
	}
	if l.EffectiveMinTapePoints(2) < 3 {
		t.Fatalf("expected tighter tape after losses, got adjust=%d", l.EffectiveMinTapePoints(2))
	}
}

func TestAdaptiveLearnerLoosensOnWinStreak(t *testing.T) {
	dir := t.TempDir()
	l := NewAdaptiveLearner(dir, "misha", true, true, 100)
	for i := 0; i < 40; i++ {
		l.RecordClose(i%3 != 0, analyzer.Signal{AlertType: "FADE", Score: 45})
	}
	if l.EffectiveMinTapePoints(2) > 2 {
		t.Fatalf("expected looser tape after wins, got %d", l.EffectiveMinTapePoints(2))
	}
}

func TestAdaptiveLearnerDailyCap(t *testing.T) {
	dir := t.TempDir()
	l := NewAdaptiveLearner(dir, "misha", true, false, 3)
	for i := 0; i < 3; i++ {
		l.RecordOpen()
	}
	if l.CanOpenToday() {
		t.Fatal("daily cap was not enforced")
	}
	_ = filepath.Join(dir, "traders", "misha")
}

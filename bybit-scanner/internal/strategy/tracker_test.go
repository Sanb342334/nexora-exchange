package strategy

import (
	"math"
	"testing"
)

func TestRetraceUsesDumpsTrackedTrough(t *testing.T) {
	tr := &impulseTrack{
		ImpulseDir: "DUMP",
		StartPrice: 100,
		TroughPrice: 90,
	}
	got := tr.retrace(95)
	if math.Abs(got-50) > 0.001 {
		t.Fatalf("retrace = %.2f, want 50", got)
	}
}

func TestRetracePump(t *testing.T) {
	tr := &impulseTrack{
		ImpulseDir: "PUMP",
		StartPrice: 100,
		PeakPrice: 110,
	}
	got := tr.retrace(105)
	if math.Abs(got-50) > 0.001 {
		t.Fatalf("retrace = %.2f, want 50", got)
	}
}

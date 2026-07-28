package health

import (
	"testing"
	"time"
)

func TestSetInstanceExposesDurableScannerIdentity(t *testing.T) {
	tracker := New()
	startedAt := time.Date(2026, time.July, 27, 19, 45, 0, 0, time.FixedZone("UTC+3", 3*60*60))

	tracker.SetInstance("a1b2c3d4", startedAt, 1)
	got := tracker.Instance()

	if got.ID != "a1b2c3d4" {
		t.Fatalf("ID = %q, want %q", got.ID, "a1b2c3d4")
	}
	if !got.StartedAt.Equal(startedAt.UTC()) {
		t.Fatalf("StartedAt = %s, want %s", got.StartedAt, startedAt.UTC())
	}
	if got.LocalInstances != 1 {
		t.Fatalf("LocalInstances = %d, want 1", got.LocalInstances)
	}
}

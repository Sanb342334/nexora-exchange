package execution

import (
	"testing"
	"time"

	"bybit-scanner/internal/config"
)

func testExitPolicy() config.AdaptiveExitConfig {
	return config.AdaptiveExitConfig{
		Enabled: true, BreakevenAtR: 1, BreakevenLockR: 0.1,
		TrailStartR: 1.5, TrailDistanceR: 0.5, MinStopStepR: 0.05,
		TPExtendAtR: 2, TPExtendToR: 3, MinUpdateIntervalSec: 15,
	}
}

func TestCalculateExitAdjustmentLongAndShort(t *testing.T) {
	policy := testExitPolicy()
	long := ManagedDemoPosition{Side: "Buy", EntryPrice: 100, OriginalStop: 90, OriginalTP: 120}
	got := CalculateExitAdjustment(policy, long, 90, 120, 120)
	if !got.ChangeStop || got.StopLoss != 115 || !got.ChangeTP || got.TakeProfit != 130 {
		t.Fatalf("long adjustment = %+v, want trailing SL 115 and extended TP 130", got)
	}

	short := ManagedDemoPosition{Side: "Sell", EntryPrice: 100, OriginalStop: 110, OriginalTP: 80}
	got = CalculateExitAdjustment(policy, short, 110, 80, 80)
	if !got.ChangeStop || got.StopLoss != 85 || !got.ChangeTP || got.TakeProfit != 70 {
		t.Fatalf("short adjustment = %+v, want trailing SL 85 and extended TP 70", got)
	}
}

func TestCalculateExitAdjustmentNeverWidensProtection(t *testing.T) {
	policy := testExitPolicy()
	long := ManagedDemoPosition{Side: "Buy", EntryPrice: 100, OriginalStop: 90, OriginalTP: 130}
	got := CalculateExitAdjustment(policy, long, 118, 140, 120)
	if got.ChangeStop || got.ChangeTP {
		t.Fatalf("long widened protection: %+v", got)
	}

	short := ManagedDemoPosition{Side: "Sell", EntryPrice: 100, OriginalStop: 110, OriginalTP: 70}
	got = CalculateExitAdjustment(policy, short, 82, 60, 80)
	if got.ChangeStop || got.ChangeTP {
		t.Fatalf("short widened protection: %+v", got)
	}
}

func TestTPRequiresLockedProfit(t *testing.T) {
	policy := testExitPolicy()
	policy.BreakevenAtR = 10
	policy.TrailStartR = 10 // prevent a new lock at this price
	position := ManagedDemoPosition{Side: "Buy", EntryPrice: 100, OriginalStop: 90, OriginalTP: 120}
	got := CalculateExitAdjustment(policy, position, 100, 120, 121)
	if got.ChangeTP {
		t.Fatalf("TP extended without locked profit: %+v", got)
	}
	got = CalculateExitAdjustment(policy, position, 101, 120, 121)
	if !got.ChangeTP || got.TakeProfit != 130 {
		t.Fatalf("TP did not extend after profit lock: %+v", got)
	}
}

func TestAdaptiveExitIntervalGuard(t *testing.T) {
	now := time.Now()
	if !intervalElapsed(time.Time{}, now, 15) {
		t.Fatal("zero timestamp should be eligible")
	}
	if intervalElapsed(now.Add(-14*time.Second), now, 15) {
		t.Fatal("update before interval should be blocked")
	}
	if !intervalElapsed(now.Add(-15*time.Second), now, 15) {
		t.Fatal("update at interval should be eligible")
	}
}

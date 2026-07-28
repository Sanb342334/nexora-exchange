package execution

import (
	"context"
	"errors"
	"testing"
)

type fakeLegExecutor struct {
	results []LegResult
	errs    []error
	closed  []LegOrder
	calls   int
}

func (f *fakeLegExecutor) OpenLeg(_ context.Context, _ LegOrder) (LegResult, error) {
	i := f.calls
	f.calls++
	if i >= len(f.results) {
		i = len(f.results) - 1
	}
	return f.results[i], f.errs[i]
}

func (f *fakeLegExecutor) CloseLeg(_ context.Context, leg LegOrder) error {
	f.closed = append(f.closed, leg)
	return nil
}

func TestCarryCoordinatorRollsBackSpotWhenPerpFails(t *testing.T) {
	exec := &fakeLegExecutor{
		results: []LegResult{{OrderID: "spot", Filled: true}, {}},
		errs:    []error{nil, errors.New("perp rejected")},
	}
	coordinator := NewCarryCoordinator(exec, nil)
	_, _, err := coordinator.Open(context.Background(), CarryIntent{
		ID:   "carry-1",
		Spot: LegOrder{Category: CategorySpot, Symbol: "BTCUSDT", Side: "Buy", Qty: "1"},
		Perp: LegOrder{Category: CategoryLinear, Symbol: "BTCUSDT", Side: "Sell", Qty: "1"},
	})
	if err == nil {
		t.Fatal("expected carry open failure")
	}
	if len(exec.closed) != 1 || exec.closed[0].Side != "Sell" {
		t.Fatalf("spot leg was not rolled back: %+v", exec.closed)
	}
}

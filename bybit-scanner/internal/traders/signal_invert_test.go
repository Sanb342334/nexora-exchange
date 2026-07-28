package traders

import (
	"testing"

	"bybit-scanner/internal/analyzer"
)

func TestInvertSignalFlipsDirection(t *testing.T) {
	long := analyzer.Signal{TradeAction: "LONG", Movement: "PUMP", Price: 100, SuggestedSL: 98, SuggestedTP: 104}
	inv := InvertSignal(long)
	if inv.TradeAction != "SHORT" || inv.Movement != "DUMP" {
		t.Fatalf("invert long = %#v", inv)
	}
	if inv.SuggestedSL <= long.Price || inv.SuggestedTP >= long.Price {
		t.Fatalf("inverted stops not mirrored: sl=%v tp=%v", inv.SuggestedSL, inv.SuggestedTP)
	}
}

func TestInvertSignalFlipsSetupType(t *testing.T) {
	sig := analyzer.Signal{SetupType: "FADE_LONG", TradeAction: "LONG"}
	inv := InvertSignal(sig)
	if inv.SetupType != "FADE_SHORT" || inv.TradeAction != "SHORT" {
		t.Fatalf("invert fade setup = %#v", inv)
	}
}

func TestInvertSignalRoundTrip(t *testing.T) {
	orig := analyzer.Signal{TradeAction: "SHORT", Movement: "DUMP", Price: 50}
	back := InvertSignal(InvertSignal(orig))
	if back.TradeAction != orig.TradeAction || back.Movement != orig.Movement {
		t.Fatalf("round trip = %#v, want %#v", back, orig)
	}
}

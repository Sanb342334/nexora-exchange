package market

import (
	"encoding/json"
	"testing"
	"time"
)

func TestHandleLiquidationParsesV5ArrayPayload(t *testing.T) {
	events := make(chan MarketEvent, 2)
	shard := &wsShard{events: events}
	now := time.Date(2026, 7, 27, 18, 0, 0, 0, time.UTC)
	raw := json.RawMessage(`[
		{"s":"BTCUSDT","S":"Buy","p":"65000","v":"0.25","T":1785175200000},
		{"s":"ETHUSDT","S":"Sell","p":"3000","v":"2","T":1785175200100}
	]`)

	if err := shard.handleLiquidation("allLiquidation.BTCUSDT", raw, now); err != nil {
		t.Fatalf("handle liquidation: %v", err)
	}
	first := <-events
	second := <-events
	if first.Symbol != "BTCUSDT" || first.LiqSide != "Buy" || first.LiqValue != 16250 {
		t.Fatalf("unexpected first liquidation: %+v", first)
	}
	if second.Symbol != "ETHUSDT" || second.LiqSide != "Sell" || second.LiqValue != 6000 {
		t.Fatalf("unexpected second liquidation: %+v", second)
	}
	if first.ExchangeAt.IsZero() || second.ExchangeAt.IsZero() {
		t.Fatalf("expected exchange timestamps: %+v %+v", first.ExchangeAt, second.ExchangeAt)
	}
	if got, want := first.ExchangeAt, time.UnixMilli(1785175200000).UTC(); !got.Equal(want) {
		t.Fatalf("first exchange timestamp = %s, want %s", got, want)
	}
	if got, want := second.ExchangeAt, time.UnixMilli(1785175200100).UTC(); !got.Equal(want) {
		t.Fatalf("second exchange timestamp = %s, want %s", got, want)
	}
}

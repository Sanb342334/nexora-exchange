package notifier

import (
	"testing"
	"time"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/risk"
	"bybit-scanner/internal/traders"
)

func TestPanelCallbacksAreVersionedAndSafe(t *testing.T) {
	if got := panelCallback("x", "sniper", "signal-123"); got != "p1:x:sniper:signal-123" {
		t.Fatalf("panelCallback() = %q", got)
	}
	if !validCallback(panelCallback("h")) {
		t.Fatal("short versioned callback must be accepted")
	}
	if validCallback(panelCallback("x", "sniper", string(make([]byte, 60)))) {
		t.Fatal("callback longer than Telegram's 64-byte limit must be rejected")
	}
	if validCallback("") {
		t.Fatal("empty callback must be rejected")
	}
}

func TestOpenPositionsKeyboardPaginatesAndSkipsLongIDs(t *testing.T) {
	positions := make([]traders.PanelPosition, 0, panelPageSize+2)
	for i := 0; i < panelPageSize+2; i++ {
		positions = append(positions, traders.PanelPosition{
			ProfileID: "sniper",
			Emoji:     "🎯",
			Entry: traders.HistoryEntry{
				SignalID: "id-" + string(rune('a'+i)),
				Symbol:   "BTCUSDT",
				Side:     risk.SideLong,
				OpenedAt: time.Now(),
			},
		})
	}
	positions[0].Entry.SignalID = string(make([]byte, 70))
	keyboard := openPositionsKeyboard(positions, 0)
	rows := keyboard["inline_keyboard"].([][]map[string]string)
	if len(rows) != panelPageSize+1 { // five safe positions, next-page navigation, home
		t.Fatalf("keyboard rows = %d, want %d", len(rows), panelPageSize+1)
	}
	if rows[len(rows)-2][0]["callback_data"] != "p1:o:6" {
		t.Fatalf("next page callback = %q", rows[len(rows)-2][0]["callback_data"])
	}
	for _, row := range rows {
		for _, button := range row {
			if data := button["callback_data"]; !validCallback(data) {
				t.Fatalf("unsafe callback emitted: %q", data)
			}
		}
	}
}

func TestPositionActionTokensAreOpaqueScopedAndSingleUse(t *testing.T) {
	n := &Notifier{
		cfg:             &config.Config{TelegramChatID: 42},
		positionActions: make(map[string]positionAction),
	}
	callback := n.newPositionAction(42, "btcusdt", "c25", 0, 0)
	const prefix = "p1:pc:"
	if len(callback) <= len(prefix) || !validCallback(callback) {
		t.Fatalf("unsafe position callback %q", callback)
	}
	token := callback[len(prefix):]
	if _, ok := n.consumePositionAction(7, token); ok {
		t.Fatal("token was accepted for a different chat")
	}
	action, ok := n.consumePositionAction(42, token)
	if !ok || action.symbol != "BTCUSDT" || action.kind != "c25" {
		t.Fatalf("unexpected consumed action: %+v, ok=%v", action, ok)
	}
	if _, ok := n.consumePositionAction(42, token); ok {
		t.Fatal("consumed token was replayed")
	}
}

func TestPositionActionTokenExpires(t *testing.T) {
	n := &Notifier{positionActions: map[string]positionAction{
		"expired": {chatID: 42, expiresAt: time.Now().Add(-time.Second)},
	}}
	if _, ok := n.consumePositionAction(42, "expired"); ok {
		t.Fatal("expired token was accepted")
	}
	if _, exists := n.positionActions["expired"]; exists {
		t.Fatal("expired token was not removed")
	}
}

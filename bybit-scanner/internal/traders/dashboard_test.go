package traders

import (
	"strings"
	"testing"
	"time"

	"bybit-scanner/internal/risk"
)

func TestBuildPanelPositionsReturnsOnlyOpenNewestFirst(t *testing.T) {
	now := time.Now()
	profiles := []Profile{{ID: "old", Name: "Old", Emoji: "🟡"}, {ID: "new", Name: "New", Emoji: "🟢"}}
	histories := map[string][]HistoryEntry{
		"old": {
			{SignalID: "closed", Symbol: "ETHUSDT", OpenedAt: now.Add(-time.Hour)},
			{SignalID: "old-open", Symbol: "BTCUSDT", Unrealized: true, OpenedAt: now.Add(-30 * time.Minute)},
		},
		"new": {{SignalID: "new-open", Symbol: "SOLUSDT", Unrealized: true, OpenedAt: now}},
	}
	got := BuildPanelPositions(profiles, histories)
	if len(got) != 2 {
		t.Fatalf("positions = %d, want 2", len(got))
	}
	if got[0].ProfileID != "new" || got[1].ProfileID != "old" {
		t.Fatalf("unexpected ordering: %#v", got)
	}
}

func TestFormatPanelPositionShowsProtectionAndMarkSource(t *testing.T) {
	pnl := 12.5
	text := FormatPanelPositionHTML(PanelPosition{
		ProfileName: "Саша",
		Emoji:       "🎯",
		Entry: HistoryEntry{
			Symbol: "BTCUSDT", Side: risk.SideLong, Entry: 100, MarkPrice: 101,
			StopLoss: 98, TakeProfit: 104, Unrealized: true, PnL: &pnl,
		},
	})
	for _, want := range []string{"SL", "TP", "Mark PnL", "reconciliation"} {
		if !strings.Contains(text, want) {
			t.Fatalf("position card missing %q: %s", want, text)
		}
	}
}

func TestTraderHistoryKeyboardUsesSafeVersionedCallbacks(t *testing.T) {
	pnl := 1.0
	keyboard := TraderHistoryInlineKeyboard("sniper", []HistoryEntry{{
		SignalID: "signal-1", Symbol: "BTCUSDT", Unrealized: true, PnL: &pnl,
	}}, 0, 1)
	rows := keyboard["inline_keyboard"].([][]map[string]string)
	if got := rows[0][0]["callback_data"]; got != "p1:z:sniper:signal-1" && got != "p1:x:sniper:signal-1" {
		t.Fatalf("callback = %q", got)
	}
}

func TestPaperProfileDashboardClearlyExcludesBybit(t *testing.T) {
	text := FormatTraderDetailHTML(Profile{
		ID: "misha", Name: "Миша", Emoji: "🔬", ExecutionMode: ExecutionPaper,
	}, Stats{}, 1_000, true, nil)
	for _, want := range []string{"PAPER / SHADOW", "никогда не входит в Bybit"} {
		if !strings.Contains(text, want) {
			t.Fatalf("paper profile dashboard missing %q: %s", want, text)
		}
	}
}

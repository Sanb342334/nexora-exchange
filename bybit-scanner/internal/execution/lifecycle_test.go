package execution

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEventJournalProjectionRestoresLatestIntentState(t *testing.T) {
	dir := t.TempDir()
	journal := NewEventJournal(dir)
	if err := journal.Append(IntentEvent{IntentID: "one", State: IntentPending, OrderLink: "link-one"}); err != nil {
		t.Fatalf("append pending: %v", err)
	}
	if err := journal.Append(IntentEvent{IntentID: "one", State: IntentProtected, OrderID: "order-one", FilledQty: 2}); err != nil {
		t.Fatalf("append protected: %v", err)
	}
	f, err := os.OpenFile(filepath.Join(dir, "execution", "events.jsonl"), os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString(`{"intent_id":"unfinished"`)
	_ = f.Close()

	projection, err := journal.Projection()
	if err != nil {
		t.Fatalf("projection: %v", err)
	}
	got := projection["one"]
	if got.State != IntentProtected || got.OrderID != "order-one" || got.FilledQty != 2 {
		t.Fatalf("unexpected projection: %+v", got)
	}
}

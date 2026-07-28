package execution

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// IntentState is the durable lifecycle of an exchange execution intent.
// A position is considered tradeable only after it reaches Protected.
type IntentState string

const (
	IntentPending         IntentState = "PENDING"
	IntentSubmitted       IntentState = "SUBMITTED"
	IntentPartiallyFilled IntentState = "PARTIALLY_FILLED"
	IntentProtected       IntentState = "PROTECTED"
	IntentClosed          IntentState = "CLOSED"
	IntentRolledBack      IntentState = "ROLLED_BACK"
	IntentFailed          IntentState = "FAILED"
)

type IntentEvent struct {
	IntentID     string      `json:"intent_id"`
	StrategyID   string      `json:"strategy_id"`
	Symbol       string      `json:"symbol"`
	State        IntentState `json:"state"`
	OrderID      string      `json:"order_id,omitempty"`
	OrderLink    string      `json:"order_link_id,omitempty"`
	RequestedQty float64     `json:"requested_qty,omitempty"`
	FilledQty    float64     `json:"filled_qty,omitempty"`
	FilledPrice  float64     `json:"filled_price,omitempty"`
	Side         string      `json:"side,omitempty"`
	OriginalStop float64     `json:"original_stop,omitempty"`
	OriginalTP   float64     `json:"original_tp,omitempty"`
	Reason       string      `json:"reason,omitempty"`
	OccurredAt   time.Time   `json:"occurred_at"`
}

// EventJournal is append-only so a failed process can be reconstructed and
// reconciled without treating an unprotected order as an open trade.
type EventJournal struct {
	mu   sync.Mutex
	path string
}

func NewEventJournal(logDir string) *EventJournal {
	dir := filepath.Join(logDir, "execution")
	_ = os.MkdirAll(dir, 0o755)
	return &EventJournal{path: filepath.Join(dir, "events.jsonl")}
}

func (j *EventJournal) Append(event IntentEvent) error {
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	f, err := os.OpenFile(j.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(data, '\n'))
	return err
}

// Projection returns the latest durable event for each intent. Malformed
// trailing lines are ignored so a crash during an append never prevents
// recovery of earlier intents.
func (j *EventJournal) Projection() (map[string]IntentEvent, error) {
	out := make(map[string]IntentEvent)
	if j == nil || j.path == "" {
		return out, nil
	}
	f, err := os.Open(j.path)
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	// JSON events can include exchange error messages. Leave generous room for
	// a single event without allowing an unbounded read.
	scanner.Buffer(make([]byte, 4*1024), 1<<20)
	for scanner.Scan() {
		var event IntentEvent
		if json.Unmarshal(scanner.Bytes(), &event) != nil || event.IntentID == "" {
			continue
		}
		out[event.IntentID] = event
	}
	return out, scanner.Err()
}

package health

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

type Tracker struct {
	lastEventUnix  atomic.Int64
	eventsTotal    atomic.Uint64
	eventsMinute   atomic.Uint64
	startedAt      time.Time
	signalsTotal   atomic.Uint64
	signalsToday   atomic.Uint64
	wsReconnects   atomic.Uint64
	lastSignal     atomic.Value
	dayStart       time.Time
	mu             sync.Mutex
	topScores      []scoreEntry
	minuteWindow   time.Time
}

type scoreEntry struct {
	Symbol    string
	Score     int
	Movement  string
	Timestamp time.Time
}

func New() *Tracker {
	now := time.Now().UTC()
	return &Tracker{
		startedAt:    now,
		dayStart:     now.Truncate(24 * time.Hour),
		minuteWindow: now,
		topScores:    make([]scoreEntry, 0, 10),
	}
}

func (t *Tracker) StartMinuteReset(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				t.eventsMinute.Store(0)
				t.minuteWindow = time.Now().UTC()
			}
		}
	}()
}

func (t *Tracker) RecordEvent() {
	t.lastEventUnix.Store(time.Now().Unix())
	t.eventsTotal.Add(1)
	t.eventsMinute.Add(1)
}

func (t *Tracker) RecordReconnect() {
	t.wsReconnects.Add(1)
}

func (t *Tracker) RecordSignal(symbol string, score int, movement string) {
	t.signalsTotal.Add(1)
	t.lastSignal.Store(symbol)

	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now().UTC()
	if now.Truncate(24*time.Hour).After(t.dayStart) {
		t.dayStart = now.Truncate(24 * time.Hour)
		t.signalsToday.Store(0)
	}
	t.signalsToday.Add(1)

	t.topScores = append(t.topScores, scoreEntry{
		Symbol: symbol, Score: score, Movement: movement, Timestamp: now,
	})
	if len(t.topScores) > 50 {
		t.topScores = t.topScores[len(t.topScores)-50:]
	}
}

func (t *Tracker) LastEventAge() time.Duration {
	ts := t.lastEventUnix.Load()
	if ts == 0 {
		return 0
	}
	return time.Since(time.Unix(ts, 0))
}

func (t *Tracker) EventsTotal() uint64    { return t.eventsTotal.Load() }
func (t *Tracker) EventsPerMinute() uint64 { return t.eventsMinute.Load() }

func (t *Tracker) Stats() (uptime time.Duration, signalsTotal, signalsToday, reconnects, eventsTotal, eventsMin uint64, lastEventAge time.Duration, lastSymbol string) {
	if v := t.lastSignal.Load(); v != nil {
		lastSymbol, _ = v.(string)
	}
	return time.Since(t.startedAt), t.signalsTotal.Load(), t.signalsToday.Load(),
		t.wsReconnects.Load(), t.eventsTotal.Load(), t.eventsMinute.Load(),
		t.LastEventAge(), lastSymbol
}

func (t *Tracker) TopSignals(n int) []scoreEntry {
	t.mu.Lock()
	defer t.mu.Unlock()
	if n > len(t.topScores) {
		n = len(t.topScores)
	}
	out := make([]scoreEntry, n)
	copy(out, t.topScores[len(t.topScores)-n:])
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func (t *Tracker) IsStale(maxAge time.Duration) bool {
	age := t.LastEventAge()
	return age > maxAge && t.lastEventUnix.Load() > 0
}

func (t *Tracker) WSStatus() string {
	if t.lastEventUnix.Load() == 0 {
		return "⏳ Ожидание первых данных..."
	}
	age := t.LastEventAge()
	if age <= 30*time.Second {
		return "🟢 OK — поток данных активен"
	}
	if age <= 2*time.Minute {
		return "🟡 Медленно — мало событий (" + age.Truncate(time.Second).String() + " назад)"
	}
	return "🔴 STALE — нет данных " + age.Truncate(time.Second).String()
}

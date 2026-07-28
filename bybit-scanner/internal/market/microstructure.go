package market

import (
	"sort"
	"sync"
	"time"
)

type LiquidityTier string

const (
	LiquidityUnavailable LiquidityTier = "UNAVAILABLE"
	LiquidityTierA       LiquidityTier = "A"
	LiquidityTierB       LiquidityTier = "B"
	LiquidityTierC       LiquidityTier = "C"
)

type BookLevel struct {
	Price float64
	Size  float64
}

type BookUpdate struct {
	Symbol     string
	Type       string // snapshot or delta
	UpdateID   int64
	PrevID     int64
	Bids       []BookLevel
	Asks       []BookLevel
	ReceivedAt time.Time
}

type BookSnapshot struct {
	Symbol    string
	Bids      []BookLevel
	Asks      []BookLevel
	UpdateID  int64
	UpdatedAt time.Time
	Stale     bool
	Gap       bool
}

// OrderBook applies Bybit snapshots/deltas in sequence. A gap invalidates the
// book until the next snapshot; callers must never infer liquidity from it.
type OrderBook struct {
	mu        sync.RWMutex
	symbol    string
	bids      map[float64]float64
	asks      map[float64]float64
	updateID  int64
	updatedAt time.Time
	gap       bool
}

type OrderBookStore struct {
	mu    sync.Mutex
	books map[string]*OrderBook
}

func NewOrderBookStore() *OrderBookStore {
	return &OrderBookStore{books: make(map[string]*OrderBook)}
}

func (s *OrderBookStore) Apply(update BookUpdate) bool {
	s.mu.Lock()
	book := s.books[update.Symbol]
	if book == nil {
		book = NewOrderBook(update.Symbol)
		s.books[update.Symbol] = book
	}
	s.mu.Unlock()
	return book.Apply(update)
}

func (s *OrderBookStore) Snapshot(symbol string, now time.Time, maxAge time.Duration) (BookSnapshot, bool) {
	s.mu.Lock()
	book := s.books[symbol]
	s.mu.Unlock()
	if book == nil {
		return BookSnapshot{}, false
	}
	return book.Snapshot(now, maxAge), true
}

func NewOrderBook(symbol string) *OrderBook {
	return &OrderBook{symbol: symbol, bids: make(map[float64]float64), asks: make(map[float64]float64)}
}

func (b *OrderBook) Apply(update BookUpdate) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if update.Type == "snapshot" {
		b.bids, b.asks = make(map[float64]float64), make(map[float64]float64)
		applyLevels(b.bids, update.Bids)
		applyLevels(b.asks, update.Asks)
		b.updateID, b.updatedAt, b.gap = update.UpdateID, update.ReceivedAt, false
		return true
	}
	if b.gap || b.updateID == 0 || (update.PrevID != 0 && update.PrevID != b.updateID) || update.UpdateID <= b.updateID {
		b.gap = true
		return false
	}
	applyLevels(b.bids, update.Bids)
	applyLevels(b.asks, update.Asks)
	b.updateID, b.updatedAt = update.UpdateID, update.ReceivedAt
	return true
}

func applyLevels(side map[float64]float64, levels []BookLevel) {
	for _, level := range levels {
		if level.Price <= 0 {
			continue
		}
		if level.Size <= 0 {
			delete(side, level.Price)
		} else {
			side[level.Price] = level.Size
		}
	}
}

func (b *OrderBook) Snapshot(now time.Time, maxAge time.Duration) BookSnapshot {
	b.mu.RLock()
	defer b.mu.RUnlock()
	s := BookSnapshot{Symbol: b.symbol, UpdateID: b.updateID, UpdatedAt: b.updatedAt, Gap: b.gap}
	s.Stale = s.UpdatedAt.IsZero() || now.Sub(s.UpdatedAt) > maxAge
	for price, size := range b.bids {
		s.Bids = append(s.Bids, BookLevel{Price: price, Size: size})
	}
	for price, size := range b.asks {
		s.Asks = append(s.Asks, BookLevel{Price: price, Size: size})
	}
	sort.Slice(s.Bids, func(i, j int) bool { return s.Bids[i].Price > s.Bids[j].Price })
	sort.Slice(s.Asks, func(i, j int) bool { return s.Asks[i].Price < s.Asks[j].Price })
	return s
}

type BookMetrics struct {
	Available  bool
	SpreadPct  float64
	BidDepth   float64
	AskDepth   float64
	Imbalance  float64
	Microprice float64
}

func MeasureBook(snapshot BookSnapshot, levels int) BookMetrics {
	if snapshot.Stale || snapshot.Gap || len(snapshot.Bids) == 0 || len(snapshot.Asks) == 0 {
		return BookMetrics{}
	}
	if levels <= 0 {
		levels = 10
	}
	bid, ask := snapshot.Bids[0], snapshot.Asks[0]
	if bid.Price <= 0 || ask.Price <= bid.Price || bid.Size <= 0 || ask.Size <= 0 {
		return BookMetrics{}
	}
	m := BookMetrics{Available: true, SpreadPct: (ask.Price - bid.Price) / ((ask.Price + bid.Price) / 2) * 100}
	for i := 0; i < len(snapshot.Bids) && i < levels; i++ {
		m.BidDepth += snapshot.Bids[i].Price * snapshot.Bids[i].Size
	}
	for i := 0; i < len(snapshot.Asks) && i < levels; i++ {
		m.AskDepth += snapshot.Asks[i].Price * snapshot.Asks[i].Size
	}
	if total := m.BidDepth + m.AskDepth; total > 0 {
		m.Imbalance = (m.BidDepth - m.AskDepth) / total
	}
	m.Microprice = (ask.Price*bid.Size + bid.Price*ask.Size) / (bid.Size + ask.Size)
	return m
}

// ClassifyLiquidity is conservative. Missing book, tick size, or WS health
// never upgrades a symbol; it yields UNAVAILABLE instead.
func ClassifyLiquidity(spreadPct, depthUSDT, tickSize float64, wsHealthy bool, bookAvailable bool) LiquidityTier {
	if !wsHealthy || !bookAvailable || spreadPct <= 0 || depthUSDT <= 0 || tickSize <= 0 {
		return LiquidityUnavailable
	}
	if spreadPct <= 0.05 && depthUSDT >= 100_000 {
		return LiquidityTierA
	}
	if spreadPct <= 0.15 && depthUSDT >= 25_000 {
		return LiquidityTierB
	}
	return LiquidityTierC
}

type SweepState struct {
	BreachedAt time.Time
	Level      float64
	Direction  string
}

// SweepTracker requires a breach, reclaim, and signed-flow confirmation.
// It only labels the event; countertrading is intentionally out of scope.
type SweepTracker struct{ state SweepState }

func (t *SweepTracker) Observe(price, level, flow float64, at time.Time, direction string) bool {
	if level <= 0 || price <= 0 {
		return false
	}
	if t.state.BreachedAt.IsZero() {
		if (direction == "DOWN" && price < level) || (direction == "UP" && price > level) {
			t.state = SweepState{BreachedAt: at, Level: level, Direction: direction}
		}
		return false
	}
	if at.Sub(t.state.BreachedAt) > 30*time.Second {
		t.state = SweepState{}
		return false
	}
	reclaimed := (t.state.Direction == "DOWN" && price >= t.state.Level && flow > 0) ||
		(t.state.Direction == "UP" && price <= t.state.Level && flow < 0)
	if reclaimed {
		t.state = SweepState{}
		return true
	}
	return false
}

package analyzer

import (
	"math"
	"sync"
	"time"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/signals"
)

const (
	WindowSize   = 60
	BTCSymbol    = "BTCUSDT"
	TradeWindowM = 1
)

type Candle struct {
	Start      time.Time
	Open       float64
	High       float64
	Low        float64
	Close      float64
	VolumeUSDT float64
	Confirmed  bool
}

type OISample struct {
	Timestamp time.Time
	Value     float64
}

type TradeBucket struct {
	BuyUSDT  float64
	SellUSDT float64
	Start    time.Time
}

type TriggerType string

const (
	TriggerVolumeSpike TriggerType = "VOL_SPIKE"
	TriggerOIJump      TriggerType = "OI_JUMP"
	TriggerPriceVol    TriggerType = "PRICE_VOL"
	TriggerOrderflow   TriggerType = "ORDERFLOW"
	TriggerLiquidation TriggerType = "LIQUIDATION"
	TriggerFundingExt  TriggerType = "FUNDING_EXT"
)

type Signal struct {
	Symbol         string
	Score          int
	Movement       string
	SetupType      string
	Triggers       []TriggerType
	LatencyMs      float64
	Price          float64
	PriceChange1m  float64
	Volume1m       float64
	VolumeRatio    float64
	OIChange3m     float64
	FundingRate    float64
	LongShortRatio float64
	TradeDelta1m   float64
	Liquidation1m  float64
	BTCDecoupled   bool
	BTCChange5m    float64
	SpreadPct      float64
	ATRPct         float64
	SuggestedSL    float64
	SuggestedTP    float64
	Timestamp      time.Time

	// Pro strategy layer — explicit trade directive for risk/telegram.
	AlertType      string // IMPULSE, CONFIRMED, FADE, HOT
	TradeAction    string // LONG, SHORT
	Reasons        []string
	SignalID       string
	ParentSignalID string
}

type SymbolState struct {
	mu sync.RWMutex

	candles     [WindowSize]Candle
	candleHead  int
	candleCount int
	current     Candle
	lastKlineAt time.Time

	oiSamples []OISample

	lastPrice      float64
	bidPrice       float64
	askPrice       float64
	fundingRate    float64
	longShortRatio float64
	lastTickerAt   time.Time
	lastOIAt       time.Time

	tradeBucket    TradeBucket
	lastTradeAt    time.Time
	liquidation1m  float64
	liqWindowStart time.Time

	lastAlert      time.Time
	alertByTrigger map[TriggerType]time.Time
}

type Store struct {
	mu      sync.RWMutex
	symbols map[string]*SymbolState
}

type BTCTracker struct {
	mu          sync.RWMutex
	prices      []pricePoint
	change5mPct float64
}

type pricePoint struct {
	ts    time.Time
	price float64
}

func NewStore() *Store {
	return &Store{symbols: make(map[string]*SymbolState)}
}

func NewBTCTracker() *BTCTracker {
	return &BTCTracker{prices: make([]pricePoint, 0, 128)}
}

func (s *Store) Ensure(symbol string) *SymbolState {
	s.mu.RLock()
	st, ok := s.symbols[symbol]
	s.mu.RUnlock()
	if ok {
		return st
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if st, ok = s.symbols[symbol]; ok {
		return st
	}
	st = &SymbolState{
		oiSamples:      make([]OISample, 0, 64),
		alertByTrigger: make(map[TriggerType]time.Time),
		liqWindowStart: time.Now().UTC(),
	}
	s.symbols[symbol] = st
	return st
}

func (s *Store) Get(symbol string) (*SymbolState, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st, ok := s.symbols[symbol]
	return st, ok
}

func (s *Store) Symbols() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, 0, len(s.symbols))
	for sym := range s.symbols {
		out = append(out, sym)
	}
	return out
}

func (t *BTCTracker) Update(price float64, ts time.Time) {
	if price <= 0 {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	t.prices = append(t.prices, pricePoint{ts: ts, price: price})
	cutoff := ts.Add(-6 * time.Minute)
	i := 0
	for i < len(t.prices) && t.prices[i].ts.Before(cutoff) {
		i++
	}
	if i > 0 {
		t.prices = append([]pricePoint(nil), t.prices[i:]...)
	}

	target5m := ts.Add(-5 * time.Minute)
	var baseline float64
	for _, p := range t.prices {
		if p.ts.After(target5m) || p.ts.Equal(target5m) {
			baseline = p.price
			break
		}
	}
	if baseline == 0 && len(t.prices) > 0 {
		baseline = t.prices[0].price
	}
	if baseline > 0 {
		t.change5mPct = ((price - baseline) / baseline) * 100
	}
}

func (t *BTCTracker) Change5m() float64 {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.change5mPct
}

func (st *SymbolState) UpdateKline(c Candle) {
	st.UpdateKlineAt(c, time.Now().UTC())
}

// UpdateKlineAt records the receipt timestamp separately from the candle
// boundary, allowing quality freshness checks to reject delayed feed updates.
func (st *SymbolState) UpdateKlineAt(c Candle, receivedAt time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lastKlineAt = receivedAt

	if c.Confirmed {
		st.candles[st.candleHead] = c
		st.candleHead = (st.candleHead + 1) % WindowSize
		if st.candleCount < WindowSize {
			st.candleCount++
		}
		st.current = Candle{}
	} else {
		st.current = c
	}
	if c.Close > 0 {
		st.lastPrice = c.Close
	}
}

func (st *SymbolState) UpdateTicker(price, bid, ask, funding, oi float64, ts time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()
	if price > 0 {
		st.lastPrice = price
	}
	if bid > 0 {
		st.bidPrice = bid
	}
	if ask > 0 {
		st.askPrice = ask
	}
	st.fundingRate = funding
	st.lastTickerAt = ts
	if oi > 0 {
		st.oiSamples = append(st.oiSamples, OISample{Timestamp: ts, Value: oi})
		st.lastOIAt = ts
		cutoff := ts.Add(-5 * time.Minute)
		i := 0
		for i < len(st.oiSamples) && st.oiSamples[i].Timestamp.Before(cutoff) {
			i++
		}
		if i > 0 {
			st.oiSamples = append([]OISample(nil), st.oiSamples[i:]...)
		}
	}
}

func (st *SymbolState) UpdateLongShortRatio(ratio float64) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.longShortRatio = ratio
}

func (st *SymbolState) UpdateOI(value float64, ts time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.oiSamples = append(st.oiSamples, OISample{Timestamp: ts, Value: value})
	st.lastOIAt = ts
	cutoff := ts.Add(-5 * time.Minute)
	i := 0
	for i < len(st.oiSamples) && st.oiSamples[i].Timestamp.Before(cutoff) {
		i++
	}
	if i > 0 {
		st.oiSamples = append([]OISample(nil), st.oiSamples[i:]...)
	}
}

func (st *SymbolState) UpdateTrade(side string, valueUSDT float64, ts time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lastTradeAt = ts

	if st.tradeBucket.Start.IsZero() || ts.Sub(st.tradeBucket.Start) >= time.Minute {
		st.tradeBucket = TradeBucket{Start: ts.Truncate(time.Minute)}
	}
	if side == "Buy" {
		st.tradeBucket.BuyUSDT += valueUSDT
	} else {
		st.tradeBucket.SellUSDT += valueUSDT
	}
}

func (st *SymbolState) UpdateLiquidation(valueUSDT float64, ts time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()

	if st.liqWindowStart.IsZero() || ts.Sub(st.liqWindowStart) >= time.Minute {
		st.liquidation1m = 0
		st.liqWindowStart = ts.Truncate(time.Minute)
	}
	st.liquidation1m += valueUSDT
}

// FreshTicker reports whether executable bid/ask data is recent enough for a
// fast-entry decision. It deliberately does not treat a delayed REST value as
// fresh market data.
func (st *SymbolState) FreshTicker(now time.Time, maxAge time.Duration) bool {
	st.mu.RLock()
	defer st.mu.RUnlock()
	return !st.lastTickerAt.IsZero() && now.Sub(st.lastTickerAt) <= maxAge &&
		st.bidPrice > 0 && st.askPrice > 0
}

func (st *SymbolState) CanAlert(cooldown time.Duration, triggers []TriggerType, now time.Time) bool {
	st.mu.RLock()
	defer st.mu.RUnlock()

	if !st.lastAlert.IsZero() && now.Sub(st.lastAlert) < cooldown {
		return false
	}
	for _, tr := range triggers {
		if last, ok := st.alertByTrigger[tr]; ok && now.Sub(last) < cooldown {
			return false
		}
	}
	return true
}

func (st *SymbolState) MarkAlert(triggers []TriggerType, now time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lastAlert = now
	for _, tr := range triggers {
		st.alertByTrigger[tr] = now
	}
}

func (st *SymbolState) avgVolume() float64 {
	if st.candleCount == 0 {
		return 0
	}
	start := (st.candleHead - st.candleCount + WindowSize) % WindowSize
	var sum float64
	for i := 0; i < st.candleCount; i++ {
		idx := (start + i) % WindowSize
		sum += st.candles[idx].VolumeUSDT
	}
	return sum / float64(st.candleCount)
}

func (st *SymbolState) calcATRPct() float64 {
	if st.candleCount < 2 {
		return 2.0
	}
	start := (st.candleHead - st.candleCount + WindowSize) % WindowSize
	var sum float64
	count := 0
	for i := 0; i < st.candleCount; i++ {
		idx := (start + i) % WindowSize
		c := st.candles[idx]
		if c.Close <= 0 {
			continue
		}
		tr := c.High - c.Low
		if tr <= 0 {
			tr = math.Abs(c.Close - c.Open)
		}
		sum += (tr / c.Close) * 100
		count++
	}
	if count == 0 {
		return 2.0
	}
	return sum / float64(count)
}

func (st *SymbolState) activeCandle() Candle {
	if st.current.Start.IsZero() && st.candleCount > 0 {
		idx := (st.candleHead - 1 + WindowSize) % WindowSize
		return st.candles[idx]
	}
	return st.current
}

func (st *SymbolState) oiChange3m(now time.Time) float64 {
	if len(st.oiSamples) < 2 {
		return 0
	}
	latest := st.oiSamples[len(st.oiSamples)-1]
	target := now.Add(-3 * time.Minute)

	var baseline *OISample
	for i := range st.oiSamples {
		if st.oiSamples[i].Timestamp.After(target) || st.oiSamples[i].Timestamp.Equal(target) {
			baseline = &st.oiSamples[i]
			break
		}
	}
	if baseline == nil {
		baseline = &st.oiSamples[0]
	}
	if baseline.Value == 0 {
		return 0
	}
	return ((latest.Value - baseline.Value) / baseline.Value) * 100
}

func (st *SymbolState) spreadPct() float64 {
	if st.bidPrice <= 0 || st.askPrice <= 0 {
		return 0
	}
	mid := (st.bidPrice + st.askPrice) / 2
	if mid <= 0 {
		return 0
	}
	return ((st.askPrice - st.bidPrice) / mid) * 100
}

func (st *SymbolState) tradeDelta() float64 {
	return st.tradeBucket.BuyUSDT - st.tradeBucket.SellUSDT
}

func (st *SymbolState) LastPrice() float64 {
	st.mu.RLock()
	defer st.mu.RUnlock()
	if st.lastPrice > 0 {
		return st.lastPrice
	}
	c := st.activeCandle()
	if c.Close > 0 {
		return c.Close
	}
	return c.Open
}

func (st *SymbolState) OrderflowDelta() float64 {
	st.mu.RLock()
	defer st.mu.RUnlock()
	return st.tradeDelta()
}

func (st *SymbolState) RecentCandles(n int) []Candle {
	st.mu.RLock()
	defer st.mu.RUnlock()
	if n <= 0 || st.candleCount == 0 {
		return nil
	}
	if n > st.candleCount {
		n = st.candleCount
	}
	out := make([]Candle, 0, n)
	start := (st.candleHead - st.candleCount + WindowSize) % WindowSize
	for i := st.candleCount - n; i < st.candleCount; i++ {
		idx := (start + i) % WindowSize
		out = append(out, st.candles[idx])
	}
	return out
}

// QualitySnapshot is an immutable, point-in-time feature view for audit and
// research. It deliberately exposes freshness separately from values: callers
// must not turn a missing feed into a neutral or favourable factor.
type QualitySnapshot struct {
	Symbol               string
	ObservedAt           time.Time
	Price                float64
	Bid                  float64
	Ask                  float64
	SpreadPct            float64
	FundingRate          float64
	LongShortRatio       float64
	OIChange3m           float64
	TradeBuyUSDT         float64
	TradeSellUSDT        float64
	TradeDeltaUSDT       float64
	Liquidation1mUSDT    float64
	Candle               Candle
	NormalizedVolumeUSDT float64
	TickerAt             time.Time
	OIAt                 time.Time
	TradeAt              time.Time
	KlineAt              time.Time
}

// SnapshotQuality captures live fields once under the state lock. The
// in-progress candle turnover is normalized to a full minute so assessments
// made early in the candle are comparable without treating it as a close.
func (st *SymbolState) SnapshotQuality(symbol string, now time.Time) QualitySnapshot {
	st.mu.RLock()
	defer st.mu.RUnlock()
	candle := st.activeCandle()
	price := st.lastPrice
	if price <= 0 {
		price = candle.Close
	}
	normalizedVolume := candle.VolumeUSDT
	if !candle.Confirmed && !candle.Start.IsZero() {
		elapsed := now.Sub(candle.Start)
		if elapsed > 0 && elapsed < time.Minute {
			normalizedVolume *= time.Minute.Seconds() / elapsed.Seconds()
		}
	}
	return QualitySnapshot{
		Symbol: symbol, ObservedAt: now, Price: price, Bid: st.bidPrice, Ask: st.askPrice,
		SpreadPct: st.spreadPct(), FundingRate: st.fundingRate, LongShortRatio: st.longShortRatio,
		OIChange3m: st.oiChange3m(now), TradeBuyUSDT: st.tradeBucket.BuyUSDT,
		TradeSellUSDT: st.tradeBucket.SellUSDT, TradeDeltaUSDT: st.tradeDelta(),
		Liquidation1mUSDT: st.liquidation1m, Candle: candle, NormalizedVolumeUSDT: normalizedVolume,
		TickerAt: st.lastTickerAt, OIAt: st.lastOIAt, TradeAt: st.lastTradeAt, KlineAt: st.lastKlineAt,
	}
}

type Detector struct {
	cfg *config.Config
	btc *BTCTracker
}

func NewDetector(cfg *config.Config, btc *BTCTracker) *Detector {
	return &Detector{cfg: cfg, btc: btc}
}

func (d *Detector) Evaluate(symbol string, st *SymbolState, receivedAt time.Time) (*Signal, bool) {
	if symbol == BTCSymbol {
		return nil, false
	}

	yamlCfg := d.cfg.Snapshot()
	thr := d.cfg.ThresholdsFor(symbol)
	weights := yamlCfg.Scoring

	st.mu.RLock()
	defer st.mu.RUnlock()

	candle := st.activeCandle()
	if candle.Close <= 0 && st.lastPrice <= 0 {
		return nil, false
	}

	price := st.lastPrice
	if price <= 0 {
		price = candle.Close
	}

	var priceChange1m float64
	if candle.Open > 0 {
		priceChange1m = ((candle.Close - candle.Open) / candle.Open) * 100
	}

	avgVol := st.avgVolume()
	vol1m := candle.VolumeUSDT
	var volRatio float64
	if avgVol > 0 {
		volRatio = vol1m / avgVol
	}

	oiChange := st.oiChange3m(receivedAt)
	spread := st.spreadPct()
	tradeDelta := st.tradeDelta()
	liq1m := st.liquidation1m
	atrPct := st.calcATRPct()
	btcChange := d.btc.Change5m()

	var triggers []TriggerType
	var score int

	if volRatio >= thr.VolumeSpikeRatio && vol1m > 0 {
		triggers = append(triggers, TriggerVolumeSpike)
		ratio := volRatio / thr.VolumeSpikeRatio
		score += scaleScore(weights.VolumeWeight, ratio, 1.0, 3.0)
	}
	if math.Abs(oiChange) >= thr.OIJumpPct {
		triggers = append(triggers, TriggerOIJump)
		ratio := math.Abs(oiChange) / thr.OIJumpPct
		score += scaleScore(weights.OIWeight, ratio, 1.0, 2.5)
	}
	if math.Abs(priceChange1m) >= thr.PriceVolPct {
		triggers = append(triggers, TriggerPriceVol)
		ratio := math.Abs(priceChange1m) / thr.PriceVolPct
		score += scaleScore(weights.PriceWeight, ratio, 1.0, 2.5)
	}

	totalTrade := st.tradeBucket.BuyUSDT + st.tradeBucket.SellUSDT
	if totalTrade > 0 {
		deltaPct := (tradeDelta / totalTrade) * 100
		if math.Abs(deltaPct) >= 30 {
			triggers = append(triggers, TriggerOrderflow)
			score += scaleScore(weights.OrderflowWeight, math.Abs(deltaPct)/30, 1.0, 2.0)
		}
	}

	if liq1m > 0 && vol1m > 0 && liq1m/vol1m >= 0.05 {
		triggers = append(triggers, TriggerLiquidation)
		score += scaleScore(weights.OrderflowWeight/2, liq1m/vol1m/0.05, 1.0, 3.0)
	}

	fundingPct := st.fundingRate * 100
	if math.Abs(fundingPct) >= thr.FundingExtremePct {
		triggers = append(triggers, TriggerFundingExt)
	}

	btcDecoupled := isBTCDecoupled(btcChange, priceChange1m, thr.BTCCorrelationPct)
	if btcDecoupled && len(triggers) > 0 {
		score += weights.BTCDecoupleWeight
	}

	if len(triggers) == 0 {
		return nil, false
	}
	if score > 100 {
		score = 100
	}
	if score < thr.MinScore {
		return nil, false
	}
	if spread > thr.MaxSpreadPct && spread > 0 {
		return nil, false
	}
	if isBTCCorrelated(btcChange, priceChange1m, thr.BTCCorrelationPct) {
		return nil, false
	}

	movement := "PUMP"
	if priceChange1m < 0 {
		movement = "DUMP"
	}

	setupType := classifySetup(movement, oiChange, priceChange1m, tradeDelta, liq1m, fundingPct)

	slMult := yamlCfg.Paper.SLATRMult
	tpMult := yamlCfg.Paper.TPATRMult
	slDist := price * (atrPct / 100) * slMult
	tpDist := price * (atrPct / 100) * tpMult

	suggestedSL := price - slDist
	suggestedTP := price + tpDist
	if movement == "DUMP" {
		suggestedSL = price + slDist
		suggestedTP = price - tpDist
	}

	latencyMs := float64(time.Since(receivedAt).Microseconds()) / 1000.0

	return &Signal{
		Symbol:         symbol,
		Score:          score,
		Movement:       movement,
		SetupType:      setupType,
		Triggers:       triggers,
		LatencyMs:      latencyMs,
		Price:          price,
		PriceChange1m:  priceChange1m,
		Volume1m:       vol1m,
		VolumeRatio:    volRatio,
		OIChange3m:     oiChange,
		FundingRate:    fundingPct,
		LongShortRatio: st.longShortRatio,
		TradeDelta1m:   tradeDelta,
		Liquidation1m:  liq1m,
		BTCDecoupled:   btcDecoupled,
		BTCChange5m:    btcChange,
		SpreadPct:      spread,
		ATRPct:         atrPct,
		SuggestedSL:    suggestedSL,
		SuggestedTP:    suggestedTP,
		Timestamp:      receivedAt,
		SignalID:       signals.NewID(),
	}, true
}

func scaleScore(maxPts int, ratio, minRatio, maxRatio float64) int {
	if ratio <= minRatio {
		return maxPts / 3
	}
	if ratio >= maxRatio {
		return maxPts
	}
	frac := (ratio - minRatio) / (maxRatio - minRatio)
	return int(float64(maxPts) * (0.33 + 0.67*frac))
}

func isBTCDecoupled(btcChange, altChange, threshold float64) bool {
	if math.Abs(btcChange) < threshold {
		return math.Abs(altChange) >= threshold
	}
	return math.Abs(altChange) > math.Abs(btcChange)*1.5
}

func isBTCCorrelated(btcChange, altChange, threshold float64) bool {
	if math.Abs(btcChange) < threshold {
		return false
	}
	if (btcChange > 0 && altChange > 0) || (btcChange < 0 && altChange < 0) {
		return math.Abs(altChange) < math.Abs(btcChange)*1.8
	}
	return false
}

func classifySetup(movement string, oiChange, priceChange, tradeDelta, liq1m, funding float64) string {
	if movement == "PUMP" && oiChange > 2 && tradeDelta > 0 {
		return "SHORT_SQUEEZE"
	}
	if movement == "DUMP" && liq1m > 0 && oiChange < -1 {
		return "LONG_LIQUIDATION"
	}
	if math.Abs(funding) > 0.05 && movement == "PUMP" && funding > 0 {
		return "OVERLEVERAGED_LONGS"
	}
	if math.Abs(funding) > 0.05 && movement == "DUMP" && funding < 0 {
		return "OVERLEVERAGED_SHORTS"
	}
	if movement == "PUMP" {
		return "PUMP"
	}
	return "DUMP"
}

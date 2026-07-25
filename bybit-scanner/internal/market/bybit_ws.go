package market

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/health"
	"bybit-scanner/internal/logger"

	"github.com/gorilla/websocket"
)

const (
	maxBackoff       = 30 * time.Second
	pingInterval     = 20 * time.Second
	readWait         = 30 * time.Second
	writeWait        = 10 * time.Second
	maxSubscriptions = 80
)

type EventType int

const (
	EventKline EventType = iota
	EventTicker
	EventTrade
	EventLiquidation
)

type MarketEvent struct {
	Type       EventType
	Symbol     string
	ReceivedAt time.Time
	Kline      analyzer.Candle
	Price      float64
	Bid        float64
	Ask        float64
	Funding    float64
	OpenInterest float64
	TradeSide  string
	TradeValue float64
	LiqValue   float64
}

type WSManager struct {
	cfg     *config.Config
	log     *logger.Loggers
	health  *health.Tracker
	events  chan MarketEvent
	shards  []*wsShard
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	symbols []string
}

type wsShard struct {
	id      int
	symbols []string
	url     string
	log     *logger.Loggers
	health  *health.Tracker
	events  chan<- MarketEvent
	cancel  context.CancelFunc
}

type wsEnvelope struct {
	Topic string          `json:"topic"`
	Type  string          `json:"type"`
	Ts    int64           `json:"ts"`
	Data  json.RawMessage `json:"data"`
}

type klinePayload struct {
	Start    int64  `json:"start"`
	Open     string `json:"open"`
	High     string `json:"high"`
	Low      string `json:"low"`
	Close    string `json:"close"`
	Turnover string `json:"turnover"`
	Confirm  bool   `json:"confirm"`
}

type tickerPayload struct {
	Symbol       string `json:"symbol"`
	LastPrice    string `json:"lastPrice"`
	Bid1Price    string `json:"bid1Price"`
	Ask1Price    string `json:"ask1Price"`
	FundingRate  string `json:"fundingRate"`
	OpenInterest string `json:"openInterest"`
}

type tradePayload struct {
	Symbol    string `json:"s"`
	Side      string `json:"S"`
	Price     string `json:"p"`
	Volume    string `json:"v"`
	Timestamp int64  `json:"T"`
}

type liquidationPayload struct {
	Symbol string `json:"symbol"`
	Side   string `json:"side"`
	Price  string `json:"price"`
	Size   string `json:"size"`
}

func NewWSManager(cfg *config.Config, log *logger.Loggers, healthTracker *health.Tracker, symbols []string) *WSManager {
	return &WSManager{
		cfg:     cfg,
		log:     log,
		health:  healthTracker,
		events:  make(chan MarketEvent, 16384),
		symbols: symbols,
	}
}

func (m *WSManager) Events() <-chan MarketEvent {
	return m.events
}

func (m *WSManager) Start(ctx context.Context) {
	ctx, m.cancel = context.WithCancel(ctx)
	shardSize := m.cfg.WSShardSize
	if shardSize <= 0 {
		shardSize = 30
	}

	for i := 0; i < len(m.symbols); i += shardSize {
		end := i + shardSize
		if end > len(m.symbols) {
			end = len(m.symbols)
		}
		shard := &wsShard{
			id:      len(m.shards),
			symbols: append([]string(nil), m.symbols[i:end]...),
			url:     m.cfg.BybitWSURL,
			log:     m.log,
			health:  m.health,
			events:  m.events,
		}
		m.shards = append(m.shards, shard)
		shardCtx, shardCancel := context.WithCancel(ctx)
		shard.cancel = shardCancel
		m.wg.Add(1)
		go func(s *wsShard, runCtx context.Context) {
			defer m.wg.Done()
			s.run(runCtx)
		}(shard, shardCtx)
	}

	m.log.Scanner.Info().
		Int("shards", len(m.shards)).
		Int("symbols", len(m.symbols)).
		Msg("websocket manager started")
}

func (m *WSManager) Stop() {
	if m.cancel != nil {
		m.cancel()
	}
	m.wg.Wait()
	close(m.events)
}

func (s *wsShard) run(ctx context.Context) {
	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := s.connectAndServe(ctx)
		if ctx.Err() != nil {
			return
		}

		if s.health != nil {
			s.health.RecordReconnect()
		}

		s.log.Errors.Warn().
			Int("shard", s.id).
			Err(err).
			Dur("retry_in", backoff).
			Msg("websocket disconnected, reconnecting")

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (s *wsShard) connectAndServe(ctx context.Context) error {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, s.url, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	s.log.Scanner.Info().Int("shard", s.id).Int("symbols", len(s.symbols)).Msg("websocket connected")

	if err := s.subscribe(conn, s.symbols); err != nil {
		return err
	}

	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(readWait))
	})

	pingDone := make(chan struct{})
	go s.pingLoop(conn, pingDone)
	defer close(pingDone)

	for {
		select {
		case <-ctx.Done():
			_ = conn.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
				time.Now().Add(writeWait))
			return ctx.Err()
		default:
		}

		_ = conn.SetReadDeadline(time.Now().Add(readWait))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}

		receivedAt := time.Now().UTC()
		if err := s.handleMessage(msg, receivedAt); err != nil {
			s.log.Errors.Debug().Err(err).Msg("message parse error")
		}
	}
}

func (s *wsShard) pingLoop(conn *websocket.Conn, done <-chan struct{}) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *wsShard) subscribe(conn *websocket.Conn, symbols []string) error {
	args := make([]string, 0, len(symbols)*4)
	for _, sym := range symbols {
		args = append(args,
			fmt.Sprintf("kline.1.%s", sym),
			fmt.Sprintf("tickers.%s", sym),
			fmt.Sprintf("publicTrade.%s", sym),
			fmt.Sprintf("allLiquidation.%s", sym),
		)
	}

	for i := 0; i < len(args); i += maxSubscriptions {
		end := i + maxSubscriptions
		if end > len(args) {
			end = len(args)
		}
		payload := map[string]interface{}{"op": "subscribe", "args": args[i:end]}
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return fmt.Errorf("subscribe: %w", err)
		}
		time.Sleep(150 * time.Millisecond)
	}
	return nil
}

func (s *wsShard) handleMessage(raw []byte, receivedAt time.Time) error {
	var env wsEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return err
	}
	if env.Topic == "" {
		return nil
	}

	if s.health != nil {
		s.health.RecordEvent()
	}

	switch {
	case strings.HasPrefix(env.Topic, "kline."):
		return s.handleKline(env.Topic, env.Data, receivedAt)
	case strings.HasPrefix(env.Topic, "tickers."):
		return s.handleTicker(env.Topic, env.Data, receivedAt)
	case strings.HasPrefix(env.Topic, "publicTrade."):
		return s.handleTrade(env.Data, receivedAt)
	case strings.HasPrefix(env.Topic, "allLiquidation."):
		return s.handleLiquidation(env.Topic, env.Data, receivedAt)
	}
	return nil
}

func (s *wsShard) handleKline(topic string, data json.RawMessage, receivedAt time.Time) error {
	symbol := topicSymbol(topic)
	var rows []klinePayload
	if err := json.Unmarshal(data, &rows); err != nil {
		var single klinePayload
		if err2 := json.Unmarshal(data, &single); err2 != nil {
			return err
		}
		rows = []klinePayload{single}
	}
	if len(rows) == 0 {
		return nil
	}
	row := rows[0]

	open, _ := strconv.ParseFloat(row.Open, 64)
	high, _ := strconv.ParseFloat(row.High, 64)
	low, _ := strconv.ParseFloat(row.Low, 64)
	closeP, _ := strconv.ParseFloat(row.Close, 64)
	turnover, _ := strconv.ParseFloat(row.Turnover, 64)

	s.events <- MarketEvent{
		Type:       EventKline,
		Symbol:     symbol,
		ReceivedAt: receivedAt,
		Kline: analyzer.Candle{
			Start: time.UnixMilli(row.Start).UTC(), Open: open, High: high,
			Low: low, Close: closeP, VolumeUSDT: turnover, Confirmed: row.Confirm,
		},
	}
	return nil
}

func (s *wsShard) handleTicker(topic string, data json.RawMessage, receivedAt time.Time) error {
	symbol := topicSymbol(topic)
	var row tickerPayload
	if err := json.Unmarshal(data, &row); err != nil {
		var rows []tickerPayload
		if err2 := json.Unmarshal(data, &rows); err2 != nil || len(rows) == 0 {
			return err
		}
		row = rows[0]
	}
	if row.Symbol != "" {
		symbol = row.Symbol
	}

	price, _ := strconv.ParseFloat(row.LastPrice, 64)
	bid, _ := strconv.ParseFloat(row.Bid1Price, 64)
	ask, _ := strconv.ParseFloat(row.Ask1Price, 64)
	funding, _ := strconv.ParseFloat(row.FundingRate, 64)
	oi, _ := strconv.ParseFloat(row.OpenInterest, 64)

	s.events <- MarketEvent{
		Type: EventTicker, Symbol: symbol, ReceivedAt: receivedAt,
		Price: price, Bid: bid, Ask: ask, Funding: funding, OpenInterest: oi,
	}
	return nil
}

func (s *wsShard) handleTrade(data json.RawMessage, receivedAt time.Time) error {
	var rows []tradePayload
	if err := json.Unmarshal(data, &rows); err != nil {
		var single tradePayload
		if err2 := json.Unmarshal(data, &single); err2 != nil {
			return err
		}
		rows = []tradePayload{single}
	}
	for _, row := range rows {
		price, _ := strconv.ParseFloat(row.Price, 64)
		vol, _ := strconv.ParseFloat(row.Volume, 64)
		value := price * vol
		s.events <- MarketEvent{
			Type: EventTrade, Symbol: row.Symbol, ReceivedAt: receivedAt,
			TradeSide: row.Side, TradeValue: value,
		}
	}
	return nil
}

func (s *wsShard) handleLiquidation(topic string, data json.RawMessage, receivedAt time.Time) error {
	symbol := topicSymbol(topic)
	var row liquidationPayload
	if err := json.Unmarshal(data, &row); err != nil {
		return err
	}
	if row.Symbol != "" {
		symbol = row.Symbol
	}
	price, _ := strconv.ParseFloat(row.Price, 64)
	size, _ := strconv.ParseFloat(row.Size, 64)
	s.events <- MarketEvent{
		Type: EventLiquidation, Symbol: symbol, ReceivedAt: receivedAt,
		LiqValue: price * size,
	}
	return nil
}

func topicSymbol(topic string) string {
	parts := strings.Split(topic, ".")
	if len(parts) == 0 {
		return topic
	}
	return parts[len(parts)-1]
}

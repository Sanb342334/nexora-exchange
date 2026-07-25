package notifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/health"
	"bybit-scanner/internal/logger"
	"bybit-scanner/internal/paper"
)

const (
	btnLogs      = "📋 Логи"
	btnTest      = "🧪 Тестовый сигнал"
	btnStats     = "📊 Статус"
	btnTop       = "🏆 Топ сигналов"
	btnUnsubscribe = "🔕 Отписаться"
)

type Notifier struct {
	cfg          *config.Config
	log          *logger.Loggers
	health       *health.Tracker
	journal      *paper.Journal
	subscribers  *SubscriberStore
	httpClient   *http.Client
	jobs         chan analyzer.Signal
	digestBuf    []analyzer.Signal
	mu           sync.Mutex
	wg           sync.WaitGroup
}

func New(cfg *config.Config, log *logger.Loggers, healthTracker *health.Tracker, journal *paper.Journal) *Notifier {
	subs := NewSubscriberStore(cfg.LogDir)
	if err := subs.EnsureAdmin(cfg.TelegramChatID); err != nil {
		log.Errors.Warn().Err(err).Msg("failed to seed admin subscriber")
	}

	return &Notifier{
		cfg: cfg, log: log, health: healthTracker, journal: journal,
		subscribers: subs,
		httpClient:  &http.Client{Timeout: 15 * time.Second},
		jobs:        make(chan analyzer.Signal, 256),
		digestBuf:   make([]analyzer.Signal, 0, 64),
	}
}

func (n *Notifier) Start(ctx context.Context, workers int) {
	if workers < 1 {
		workers = 2
	}
	for i := 0; i < workers; i++ {
		n.wg.Add(1)
		go n.worker(ctx)
	}
	go n.runDigest(ctx)
	go n.runBotCommands(ctx)

	n.log.Scanner.Info().Int("subscribers", n.subscribers.Count()).Msg("telegram bot ready")
}

func (n *Notifier) Stop() {
	close(n.jobs)
	n.wg.Wait()
}

func (n *Notifier) Enqueue(sig analyzer.Signal) {
	select {
	case n.jobs <- sig:
	default:
		n.log.Errors.Warn().Str("symbol", sig.Symbol).Msg("notifier queue full, dropping signal")
	}
}

func (n *Notifier) worker(ctx context.Context) {
	defer n.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case sig, ok := <-n.jobs:
			if !ok {
				return
			}
			n.dispatch(ctx, sig)
		}
	}
}

func (n *Notifier) dispatch(ctx context.Context, sig analyzer.Signal) {
	for _, trigger := range sig.Triggers {
		n.log.Signals.Info().
			Str("symbol", sig.Symbol).
			Str("trigger", string(trigger)).
			Int("score", sig.Score).
			Float64("latency_ms", sig.LatencyMs).
			Float64("volume_ratio", sig.VolumeRatio).
			Float64("price_change_1m", sig.PriceChange1m).
			Float64("oi_change_3m", sig.OIChange3m).
			Str("setup", sig.SetupType).
			Msg("signal fired")
	}

	n.log.Scanner.Info().
		Str("symbol", sig.Symbol).
		Int("score", sig.Score).
		Str("setup", sig.SetupType).
		Strs("triggers", triggersToStrings(sig.Triggers)).
		Float64("latency_ms", sig.LatencyMs).
		Msg("pump/dump signal")

	if n.health != nil {
		n.health.RecordSignal(sig.Symbol, sig.Score, sig.Movement)
	}
	if n.journal != nil {
		n.journal.Record(sig)
	}

	n.mu.Lock()
	n.digestBuf = append(n.digestBuf, sig)
	n.mu.Unlock()

	if n.cfg.DryRun {
		n.log.Console.Info().
			Str("symbol", sig.Symbol).
			Int("score", sig.Score).
			Int("subscribers", n.subscribers.Count()).
			Msg("[DRY_RUN] telegram broadcast skipped")
		return
	}

	text := formatTelegramHTML(sig)
	keyboard := buildSignalInlineKeyboard(sig.Symbol)
	n.broadcast(ctx, text, keyboard)
}

func (n *Notifier) broadcast(ctx context.Context, text string, keyboard map[string]interface{}) {
	chatIDs := n.subscribers.All()
	if len(chatIDs) == 0 {
		n.log.Errors.Warn().Msg("no subscribers — signal not sent")
		return
	}
	for _, chatID := range chatIDs {
		if err := n.sendToChat(ctx, chatID, text, keyboard); err != nil {
			n.log.Errors.Error().Int64("chat_id", chatID).Err(err).Msg("telegram send failed")
		}
	}
}

func (n *Notifier) sendToChat(ctx context.Context, chatID int64, text string, keyboard map[string]interface{}) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.cfg.TelegramBotToken)
	payload := map[string]interface{}{
		"chat_id":                  chatID,
		"text":                     text,
		"parse_mode":               "HTML",
		"disable_web_page_preview": false,
	}
	if keyboard != nil {
		payload["reply_markup"] = keyboard
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := n.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		b, _ := io.ReadAll(res.Body)
		return fmt.Errorf("telegram HTTP %d: %s", res.StatusCode, string(b))
	}
	return nil
}

func mainMenuKeyboard() map[string]interface{} {
	return map[string]interface{}{
		"keyboard": [][]map[string]string{
			{{"text": btnLogs}, {"text": btnTest}},
			{{"text": btnStats}, {"text": btnTop}},
			{{"text": btnUnsubscribe}},
		},
		"resize_keyboard":  true,
		"one_time_keyboard": false,
	}
}

func buildSignalInlineKeyboard(symbol string) map[string]interface{} {
	bybitURL := fmt.Sprintf("https://www.bybit.com/trade/usdt/%s", symbol)
	tvSymbol := strings.TrimSuffix(symbol, "USDT")
	tvURL := fmt.Sprintf("https://www.tradingview.com/chart/?symbol=BYBIT:%sUSDT.P", tvSymbol)

	return map[string]interface{}{
		"inline_keyboard": [][]map[string]string{
			{
				{"text": "📈 Bybit", "url": bybitURL},
				{"text": "📊 TradingView", "url": tvURL},
			},
		},
	}
}

func formatTelegramHTML(sig analyzer.Signal) string {
	bybitURL := fmt.Sprintf("https://www.bybit.com/trade/usdt/%s", sig.Symbol)
	tvSymbol := strings.TrimSuffix(sig.Symbol, "USDT")
	tvURL := fmt.Sprintf("https://www.tradingview.com/chart/?symbol=BYBIT:%sUSDT.P", tvSymbol)

	decouple := "нет"
	if sig.BTCDecoupled {
		decouple = "да ✓"
	}

	testBadge := ""
	if sig.SetupType == "TEST_SIGNAL" {
		testBadge = " 🧪 <b>[ТЕСТ]</b>"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "🚀 <b>%s | SCORE %d/100</b>%s\n", sig.Symbol, sig.Score, testBadge)
	fmt.Fprintf(&b, "━━━━━━━━━━━━━━━━━━━━\n")
	fmt.Fprintf(&b, "📈 <b>Движение:</b> %s\n", sig.Movement)
	fmt.Fprintf(&b, "🧠 <b>Сетап:</b> %s\n", sig.SetupType)
	fmt.Fprintf(&b, "⏱ <b>Latency:</b> %.2f ms\n\n", sig.LatencyMs)

	fmt.Fprintf(&b, "📊 <b>Vol 1m:</b> $%.0f (x%.2f)\n", sig.Volume1m, sig.VolumeRatio)
	fmt.Fprintf(&b, "🔥 <b>OI 3m:</b> %+.2f%%\n", sig.OIChange3m)
	fmt.Fprintf(&b, "💵 <b>Цена:</b> $%.6g (%+.2f%% 1m)\n", sig.Price, sig.PriceChange1m)
	fmt.Fprintf(&b, "⚡ <b>Funding:</b> %.4f%%\n", sig.FundingRate)
	fmt.Fprintf(&b, "⚖️ <b>L/S Ratio:</b> %.2f\n", sig.LongShortRatio)
	fmt.Fprintf(&b, "📶 <b>Orderflow Δ:</b> $%.0f\n", sig.TradeDelta1m)
	fmt.Fprintf(&b, "💥 <b>Liquidations 1m:</b> $%.0f\n", sig.Liquidation1m)
	fmt.Fprintf(&b, "🔗 <b>BTC decouple:</b> %s (BTC 5m: %+.2f%%)\n", decouple, sig.BTCChange5m)
	fmt.Fprintf(&b, "📏 <b>Spread:</b> %.3f%% | ATR: %.2f%%\n\n", sig.SpreadPct, sig.ATRPct)

	fmt.Fprintf(&b, "🎯 <b>Entry:</b> $%.6g\n", sig.Price)
	fmt.Fprintf(&b, "🛑 <b>SL (ATR):</b> $%.6g\n", sig.SuggestedSL)
	fmt.Fprintf(&b, "✅ <b>TP (ATR):</b> $%.6g\n\n", sig.SuggestedTP)

	triggers := triggersToStrings(sig.Triggers)
	fmt.Fprintf(&b, "🏷 <b>Триггеры:</b> %s\n\n", strings.Join(triggers, ", "))
	fmt.Fprintf(&b, "🔗 <a href=\"%s\">Bybit</a> | <a href=\"%s\">TradingView</a>", bybitURL, tvURL)

	return b.String()
}

func mockTestSignal() analyzer.Signal {
	now := time.Now().UTC()
	price := 67250.0
	return analyzer.Signal{
		Symbol:         "BTCUSDT",
		Score:          85,
		Movement:       "PUMP",
		SetupType:      "TEST_SIGNAL",
		Triggers:       []analyzer.TriggerType{analyzer.TriggerVolumeSpike, analyzer.TriggerPriceVol},
		LatencyMs:      1.25,
		Price:          price,
		PriceChange1m:  3.8,
		Volume1m:       15_000_000,
		VolumeRatio:    5.2,
		OIChange3m:     3.1,
		FundingRate:    0.0085,
		LongShortRatio: 1.42,
		TradeDelta1m:   850_000,
		Liquidation1m:  120_000,
		BTCDecoupled:   true,
		BTCChange5m:    0.3,
		SpreadPct:      0.01,
		ATRPct:         1.8,
		SuggestedSL:    price * 0.982,
		SuggestedTP:    price * 1.036,
		Timestamp:      now,
	}
}

func triggersToStrings(triggers []analyzer.TriggerType) []string {
	out := make([]string, len(triggers))
	for i, t := range triggers {
		out[i] = string(t)
	}
	return out
}

func (n *Notifier) runDigest(ctx context.Context) {
	yamlCfg := n.cfg.Snapshot()
	if !yamlCfg.Digest.Enabled {
		return
	}
	interval := time.Duration(yamlCfg.Digest.IntervalMin) * time.Minute
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n.sendDigest(ctx)
		}
	}
}

func (n *Notifier) sendDigest(ctx context.Context) {
	n.mu.Lock()
	buf := n.digestBuf
	n.digestBuf = make([]analyzer.Signal, 0, 64)
	n.mu.Unlock()

	if len(buf) == 0 || n.cfg.DryRun {
		return
	}

	var b strings.Builder
	fmt.Fprintf(&b, "📋 <b>Digest за %d мин</b>\n", n.cfg.Snapshot().Digest.IntervalMin)
	fmt.Fprintf(&b, "Сигналов: %d\n\n", len(buf))

	limit := len(buf)
	if limit > 5 {
		limit = 5
	}
	for i := len(buf) - limit; i < len(buf); i++ {
		s := buf[i]
		fmt.Fprintf(&b, "• <b>%s</b> score %d | %s %+.1f%%\n",
			s.Symbol, s.Score, s.Movement, s.PriceChange1m)
	}

	n.broadcast(ctx, b.String(), nil)
}

func (n *Notifier) runBotCommands(ctx context.Context) {
	if n.cfg.TelegramBotToken == "" {
		return
	}

	offset := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		updates, err := n.fetchUpdates(ctx, offset)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}
		for _, u := range updates {
			offset = u.UpdateID + 1
			if u.Message != nil && u.Message.Text != "" {
				n.handleMessage(ctx, u.Message)
			}
			if u.CallbackQuery != nil {
				n.handleCallback(ctx, u.CallbackQuery)
			}
		}
	}
}

type tgUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

type tgChat struct {
	ID int64 `json:"id"`
}

type tgMessage struct {
	Text string `json:"text"`
	Chat tgChat `json:"chat"`
	From tgUser `json:"from"`
}

type tgCallback struct {
	ID      string    `json:"id"`
	Data    string    `json:"data"`
	Message tgMessage `json:"message"`
	From    tgUser    `json:"from"`
}

type tgUpdate struct {
	UpdateID      int     `json:"update_id"`
	Message       *tgMessage `json:"message"`
	CallbackQuery *tgCallback `json:"callback_query"`
}

func (n *Notifier) fetchUpdates(ctx context.Context, offset int) ([]tgUpdate, error) {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=25", n.cfg.TelegramBotToken, offset)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := n.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var resp struct {
		OK     bool       `json:"ok"`
		Result []tgUpdate `json:"result"`
	}
	if err := json.NewDecoder(res.Body).Decode(&resp); err != nil {
		return nil, err
	}
	return resp.Result, nil
}

func (n *Notifier) handleMessage(ctx context.Context, msg *tgMessage) {
	chatID := msg.Chat.ID
	text := strings.TrimSpace(msg.Text)

	switch {
	case text == "/start" || text == "/subscribe":
		n.handleStart(ctx, chatID, msg.From)
	case text == "/stop" || text == btnUnsubscribe:
		n.handleStop(ctx, chatID)
	case text == "/help":
		n.sendHelp(ctx, chatID)
	case text == btnLogs || text == "/logs":
		n.sendLogs(ctx, chatID)
	case text == btnTest || text == "/test":
		n.sendTestSignal(ctx, chatID)
	case text == btnStats || text == "/stats":
		n.sendStats(ctx, chatID)
	case text == btnTop || text == "/top":
		n.sendTop(ctx, chatID)
	default:
		if strings.HasPrefix(text, "/") {
			_ = n.sendToChat(ctx, chatID, "Неизвестная команда. Нажмите /start", mainMenuKeyboard())
		}
	}
}

func (n *Notifier) handleCallback(ctx context.Context, cb *tgCallback) {
	chatID := cb.Message.Chat.ID
	switch cb.Data {
	case "logs":
		n.sendLogs(ctx, chatID)
	case "test":
		n.sendTestSignal(ctx, chatID)
	}
	n.answerCallback(ctx, cb.ID)
}

func (n *Notifier) answerCallback(ctx context.Context, callbackID string) {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", n.cfg.TelegramBotToken)
	body, _ := json.Marshal(map[string]string{"callback_query_id": callbackID})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := n.httpClient.Do(req)
	if err == nil {
		res.Body.Close()
	}
}

func (n *Notifier) handleStart(ctx context.Context, chatID int64, user tgUser) {
	added, err := n.subscribers.SubscribeAndSave(chatID, user.Username, user.FirstName)
	if err != nil {
		n.log.Errors.Error().Int64("chat_id", chatID).Err(err).Msg("subscribe failed")
	}

	name := user.FirstName
	if name == "" {
		name = "трейдер"
	}

	var welcome string
	if added {
		welcome = fmt.Sprintf(
			"👋 Привет, <b>%s</b>!\n\n"+
				"Вы подписаны на <b>Pump/Dump сигналы</b> Bybit.\n"+
				"Все алерты будут приходить сюда автоматически.\n\n"+
				"👥 Подписчиков: <b>%d</b>\n\n"+
				"Используйте кнопки ниже:",
			name, n.subscribers.Count(),
		)
	} else {
		welcome = fmt.Sprintf(
			"✅ Вы уже подписаны, <b>%s</b>!\n\n"+
				"👥 Подписчиков: <b>%d</b>",
			name, n.subscribers.Count(),
		)
	}

	_ = n.sendToChat(ctx, chatID, welcome, mainMenuKeyboard())
	n.log.Scanner.Info().Int64("chat_id", chatID).Str("user", user.Username).Bool("new", added).Msg("subscriber start")
}

func (n *Notifier) handleStop(ctx context.Context, chatID int64) {
	removed, err := n.subscribers.UnsubscribeAndSave(chatID)
	if err != nil {
		n.log.Errors.Error().Err(err).Msg("unsubscribe failed")
	}

	text := "🔕 Вы отписаны от сигналов.\n\nЧтобы снова получать алерты — /start"
	if !removed {
		text = "Вы не были подписаны.\n\nНажмите /start чтобы подписаться."
	}

	removeKeyboard := map[string]interface{}{"remove_keyboard": true}
	_ = n.sendToChat(ctx, chatID, text, removeKeyboard)
}

func (n *Notifier) sendHelp(ctx context.Context, chatID int64) {
	help := "🤖 <b>Bybit Scanner Bot</b>\n\n" +
		"<b>/start</b> — подписаться на сигналы\n" +
		"<b>/stop</b> — отписаться\n\n" +
		"<b>Кнопки:</b>\n" +
		"📋 Логи — последние записи сканера\n" +
		"🧪 Тестовый сигнал — пример алерта\n" +
		"📊 Статус — uptime и метрики\n" +
		"🏆 Топ сигналов — последние 5"
	_ = n.sendToChat(ctx, chatID, help, mainMenuKeyboard())
}

func (n *Notifier) sendLogs(ctx context.Context, chatID int64) {
	signals, err := readLogTail(n.cfg.LogDir, "signals.log", 20)
	if err != nil {
		_ = n.sendToChat(ctx, chatID, "❌ Не удалось прочитать логи: "+err.Error(), mainMenuKeyboard())
		return
	}
	_ = n.sendToChat(ctx, chatID, signals, mainMenuKeyboard())

	scannerLog, err := readLogTail(n.cfg.LogDir, "scanner.log", 10)
	if err == nil {
		_ = n.sendToChat(ctx, chatID, scannerLog, mainMenuKeyboard())
	}

	errorsLog, err := readLogTail(n.cfg.LogDir, "errors.log", 10)
	if err == nil {
		_ = n.sendToChat(ctx, chatID, errorsLog, mainMenuKeyboard())
	}
}

func (n *Notifier) sendTestSignal(ctx context.Context, chatID int64) {
	sig := mockTestSignal()
	text := "🧪 <b>Тестовый сигнал</b> (не реальный рынок)\n\n" + formatTelegramHTML(sig)
	keyboard := buildSignalInlineKeyboard(sig.Symbol)
	_ = n.sendToChat(ctx, chatID, text, keyboard)
}

func (n *Notifier) sendStats(ctx context.Context, chatID int64) {
	if n.health == nil {
		return
	}
	uptime, total, today, reconnects, lastAge, lastSym := n.health.Stats()
	openPaper := 0
	if n.journal != nil {
		openPaper = n.journal.OpenCount()
	}

	stale := "🟢 OK"
	if n.health.IsStale(2 * time.Minute) {
		stale = "🔴 STALE"
	}

	mode := "LIVE"
	if n.cfg.DryRun {
		mode = "DRY_RUN"
	}

	text := fmt.Sprintf(
		"📊 <b>Scanner Stats</b>\n\n"+
			"Status: %s\n"+
			"Mode: %s\n"+
			"Uptime: %s\n"+
			"Last event: %s ago\n"+
			"Signals total: %d\n"+
			"Signals today: %d\n"+
			"WS reconnects: %d\n"+
			"Last signal: %s\n"+
			"Paper trades open: %d\n"+
			"👥 Subscribers: %d",
		stale, mode, uptime.Truncate(time.Second), lastAge.Truncate(time.Second),
		total, today, reconnects, lastSym, openPaper, n.subscribers.Count(),
	)
	_ = n.sendToChat(ctx, chatID, text, mainMenuKeyboard())
}

func (n *Notifier) sendTop(ctx context.Context, chatID int64) {
	if n.health == nil {
		return
	}
	top := n.health.TopSignals(5)
	if len(top) == 0 {
		_ = n.sendToChat(ctx, chatID, "📭 Сигналов пока нет", mainMenuKeyboard())
		return
	}
	var b strings.Builder
	b.WriteString("🏆 <b>Top Signals</b>\n\n")
	for _, e := range top {
		fmt.Fprintf(&b, "• <b>%s</b> score %d | %s | %s\n",
			e.Symbol, e.Score, e.Movement, e.Timestamp.Format("15:04 MST"))
	}
	_ = n.sendToChat(ctx, chatID, b.String(), mainMenuKeyboard())
}

func (n *Notifier) SendHealthAlert(ctx context.Context, msg string) {
	if n.cfg.DryRun {
		return
	}
	n.broadcast(ctx, "⚠️ <b>Scanner Alert</b>\n"+msg, nil)
}

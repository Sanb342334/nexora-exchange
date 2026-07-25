package notifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
	"bybit-scanner/internal/execution"
	"bybit-scanner/internal/health"
	"bybit-scanner/internal/logger"
	"bybit-scanner/internal/market"
	"bybit-scanner/internal/paper"
	"bybit-scanner/internal/risk"
	"bybit-scanner/internal/traders"
)

func newTelegramHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			MaxIdleConns:        8,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 15 * time.Second,
		},
	}
}

const (
	btnLogs      = "📋 Логи"
	btnTest      = "🧪 Тестовый сигнал"
	btnStats     = "📊 Статус"
	btnTop       = "🏆 Топ сигналов"
	btnCheck     = "🔍 Проверка"
	btnDemoTrade = "💹 Тест autotrade"
	btnTraders   = "👥 Трейдеры"
	btnSignalLogs = "📡 Логи сигналов"
	btnMute      = "🔇 Мут 1ч"
	btnUnmute    = "🔔 Снять мут"
	btnUnsubscribe = "🔕 Отписаться"
)

type Notifier struct {
	cfg          *config.Config
	log          *logger.Loggers
	health       *health.Tracker
	journal      *paper.Journal
	subscribers  *SubscriberStore
	demoTrader   *execution.DemoTrader
	traderMgr    *traders.Manager
	httpClient   *http.Client
	pollClient   *http.Client
	jobs         chan risk.TradeRecommendation
	digestBuf    []risk.TradeRecommendation
	symbolCount  int
	seenUpdates  map[int]struct{}
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
		httpClient:  newTelegramHTTPClient(30 * time.Second),
		pollClient:  newTelegramHTTPClient(75 * time.Second),
		jobs:        make(chan risk.TradeRecommendation, 256),
		digestBuf:   make([]risk.TradeRecommendation, 0, 64),
		seenUpdates: make(map[int]struct{}),
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

	n.log.Scanner.Info().
		Int("subscribers", n.subscribers.Count()).
		Str("version", market.BuildVersion).
		Msg("telegram bot ready")
}

func (n *Notifier) Stop() {
	close(n.jobs)
	n.wg.Wait()
}

func (n *Notifier) SetTraderManager(m *traders.Manager) {
	n.traderMgr = m
}

func (n *Notifier) SetDemoTrader(t *execution.DemoTrader) {
	n.demoTrader = t
}

func (n *Notifier) SetSymbolCount(nSymbols int) {
	n.mu.Lock()
	n.symbolCount = nSymbols
	n.mu.Unlock()
}

func (n *Notifier) getSymbolCount() int {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.symbolCount
}

func (n *Notifier) shouldNotifyTelegram(score int) bool {
	minScore := n.cfg.TelegramMinNotifyScore()
	if minScore > 0 && score < minScore {
		return false
	}
	return true
}

func (n *Notifier) muteStatusLine(chatID int64) string {
	until := n.subscribers.MuteUntil(chatID)
	if until == nil || time.Now().After(*until) {
		minScore := n.cfg.TelegramMinNotifyScore()
		if minScore > 0 {
			return fmt.Sprintf("🔔 TG: score ≥ %d", minScore)
		}
		return "🔔 TG: все сигналы"
	}
	left := time.Until(*until).Truncate(time.Minute)
	return fmt.Sprintf("🔇 Мут до %s (ещё %s)", until.Local().Format("15:04"), left)
}

func (n *Notifier) setMute(ctx context.Context, chatID int64, d time.Duration) {
	until := time.Now().Add(d)
	if err := n.subscribers.SetMute(chatID, until); err != nil {
		n.log.Errors.Warn().Err(err).Int64("chat_id", chatID).Msg("save subscriber mute")
	}
	text := fmt.Sprintf(
		"🔇 <b>Мут включён</b> на %s.\nСигналы не приходят до <b>%s</b>.\n\n/mute 30 — другой срок\n/unmute — снять досрочно",
		d.Truncate(time.Minute), until.Local().Format("15:04"),
	)
	_ = n.sendToChat(ctx, chatID, text, mainMenuKeyboard())
}

func (n *Notifier) clearMute(ctx context.Context, chatID int64) {
	was, err := n.subscribers.ClearMute(chatID)
	if err != nil {
		n.log.Errors.Warn().Err(err).Int64("chat_id", chatID).Msg("clear subscriber mute")
	}
	text := "🔔 Мут снят — снова получаешь сигналы."
	if !was {
		text = "Мут не был активен."
	}
	if minScore := n.cfg.TelegramMinNotifyScore(); minScore > 0 {
		text += fmt.Sprintf("\n\nФильтр Telegram: score ≥ <b>%d</b>", minScore)
	}
	_ = n.sendToChat(ctx, chatID, text, mainMenuKeyboard())
}

func (n *Notifier) parseMuteMinutes(cmd, buttonText string) int {
	if buttonText == btnMute {
		return 60
	}
	parts := strings.Fields(cmd)
	if len(parts) >= 2 {
		if m, err := strconv.Atoi(parts[1]); err == nil && m > 0 {
			return m
		}
	}
	return 60
}

func (n *Notifier) EnqueueMultiTrader(results []traders.Result) {
	go n.dispatchMulti(context.Background(), results)
}

func (n *Notifier) dispatchMulti(ctx context.Context, results []traders.Result) {
	if n.cfg.DryRun {
		return
	}
	text := traders.FormatMultiTraderSignalHTML(results)
	if text == "" {
		return
	}
	var sym string
	score := 0
	for _, r := range results {
		if !r.Skipped {
			sym = r.Rec.Signal.Symbol
			score = r.Rec.Signal.Score
			break
		}
	}
	n.logMultiTrader(results)
	n.broadcastSignal(ctx, score, text, buildSignalInlineKeyboard(sym))
}

func (n *Notifier) logMultiTrader(results []traders.Result) {
	for _, r := range results {
		if r.Skipped {
			continue
		}
		rec := r.Rec
		sig := rec.Signal
		n.log.Signals.Info().
			Str("trader", r.Profile.ID).
			Str("symbol", sig.Symbol).
			Int("score", sig.Score).
			Str("side", string(rec.Side)).
			Int("leverage", rec.Leverage).
			Float64("notional", rec.NotionalUSDT).
			Msg("trader paper entry")
	}
}

func (n *Notifier) Enqueue(rec risk.TradeRecommendation) {
	select {
	case n.jobs <- rec:
	default:
		n.log.Errors.Warn().Str("symbol", rec.Signal.Symbol).Msg("notifier queue full, dropping signal")
	}
}

func (n *Notifier) EnqueueWatch(sig analyzer.Signal) {
	if n.cfg.DryRun {
		return
	}
	text := formatWatchHTML(sig)
	keyboard := buildSignalInlineKeyboard(sig.Symbol)
	n.broadcastSignal(context.Background(), sig.Score, text, keyboard)
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

func (n *Notifier) dispatch(ctx context.Context, rec risk.TradeRecommendation) {
	sig := rec.Signal
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
			Str("side", string(rec.Side)).
			Int("leverage", rec.Leverage).
			Float64("risk_usdt", rec.RiskUSDT).
			Float64("rr", rec.RiskReward).
			Msg("signal fired")
	}

	n.log.Scanner.Info().
		Str("symbol", sig.Symbol).
		Int("score", sig.Score).
		Str("setup", sig.SetupType).
		Str("side", string(rec.Side)).
		Int("leverage", rec.Leverage).
		Strs("triggers", triggersToStrings(sig.Triggers)).
		Float64("latency_ms", sig.LatencyMs).
		Msg("pump/dump signal")

	if n.health != nil {
		n.health.RecordSignal(sig.Symbol, sig.Score, sig.Movement)
	}
	if n.journal != nil {
		n.journal.Record(rec)
	}

	n.mu.Lock()
	n.digestBuf = append(n.digestBuf, rec)
	n.mu.Unlock()

	if n.cfg.DryRun {
		n.log.Console.Info().
			Str("symbol", sig.Symbol).
			Int("score", sig.Score).
			Int("subscribers", n.subscribers.Count()).
			Msg("[DRY_RUN] telegram broadcast skipped")
		return
	}

	text := risk.FormatTelegramHTML(rec)
	keyboard := buildSignalInlineKeyboard(sig.Symbol)
	n.broadcastSignal(ctx, sig.Score, text, keyboard)
}

func (n *Notifier) broadcastSignal(ctx context.Context, score int, text string, keyboard map[string]interface{}) {
	for _, chatID := range n.subscribers.All() {
		if n.subscribers.IsMuted(chatID) || (!n.subscribers.Allows(chatID, score, n.cfg.TelegramMinNotifyScore()) &&
			!n.subscribers.WantsSignalLogs(chatID)) {
			continue
		}
		if err := n.sendToChat(ctx, chatID, text, keyboard); err != nil {
			n.log.Errors.Error().Int64("chat_id", chatID).Err(err).Msg("telegram signal send failed")
		}
	}
}

func (n *Notifier) toggleSignalLogs(ctx context.Context, chatID int64) {
	enabled, err := n.subscribers.ToggleSignalLogs(chatID)
	if err != nil {
		n.log.Errors.Warn().Err(err).Int64("chat_id", chatID).Msg("toggle signal logs")
	}
	text := "📡 Логи сигналов выключены. Остаются только сигналы с обычным score-фильтром."
	if enabled {
		text = "📡 <b>Логи сигналов включены.</b>\nБудут приходить все торговые сигналы, включая score ниже 60.\n\nНажми кнопку ещё раз, чтобы выключить."
	}
	_ = n.sendToChat(ctx, chatID, text, mainMenuKeyboard())
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
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt) * time.Second):
			}
		}
		lastErr = n.sendToChatOnce(ctx, chatID, text, keyboard)
		if lastErr == nil {
			return nil
		}
	}
	return fmt.Errorf("%s", sanitizeTelegramErr(lastErr, n.cfg.TelegramBotToken))
}

func (n *Notifier) sendToChatOnce(ctx context.Context, chatID int64, text string, keyboard map[string]interface{}) error {
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
		return fmt.Errorf("%s", sanitizeTelegramErr(err, n.cfg.TelegramBotToken))
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
			{{"text": btnCheck}, {"text": btnTest}},
			{{"text": btnTraders}, {"text": btnDemoTrade}},
			{{"text": btnSignalLogs}, {"text": btnMute}},
			{{"text": btnUnmute}},
			{{"text": btnLogs}, {"text": btnStats}},
			{{"text": btnTop}, {"text": btnUnsubscribe}},
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

func formatWatchHTML(sig analyzer.Signal) string {
	bybitURL := fmt.Sprintf("https://www.bybit.com/trade/usdt/%s", sig.Symbol)
	tvSymbol := strings.TrimSuffix(sig.Symbol, "USDT")
	tvURL := fmt.Sprintf("https://www.tradingview.com/chart/?symbol=BYBIT:%sUSDT.P", tvSymbol)

	var b strings.Builder
	fmt.Fprintf(&b, "⚡ <b>IMPULSE</b> · <code>%s</code> · building <b>%s</b>\n", sig.Symbol, sig.TradeAction)
	fmt.Fprintf(&b, "Score <b>%d</b>/100 · awaiting confirmation (30–120s)\n\n", sig.Score)
	fmt.Fprintf(&b, "📊 Vol 1m: $%.0f (x%.1f)\n", sig.Volume1m, sig.VolumeRatio)
	fmt.Fprintf(&b, "💵 Price: $%.6g (%+.2f%% 1m)\n", sig.Price, sig.PriceChange1m)
	fmt.Fprintf(&b, "📶 Orderflow: $%.0f\n\n", sig.TradeDelta1m)
	if len(sig.Reasons) > 0 {
		fmt.Fprintf(&b, "<i>%s</i>\n\n", sig.Reasons[0])
	}
	fmt.Fprintf(&b, "🔗 <a href=\"%s\">Bybit</a> | <a href=\"%s\">TradingView</a>", bybitURL, tvURL)
	return b.String()
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
	n.digestBuf = make([]risk.TradeRecommendation, 0, 64)
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
		rec := buf[i]
		s := rec.Signal
		fmt.Fprintf(&b, "• <b>%s</b> score %d | %s %+.1f%% | %s %dx\n",
			s.Symbol, s.Score, s.Movement, s.PriceChange1m, rec.Side, rec.Leverage)
	}

	n.broadcast(ctx, b.String(), nil)
}

func (n *Notifier) runBotCommands(ctx context.Context) {
	if n.cfg.TelegramBotToken == "" {
		return
	}

	n.setupTelegram(ctx)

	offset := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		updates, err := n.fetchUpdates(ctx, offset)
		if err != nil {
			n.log.Errors.Warn().Str("error", sanitizeTelegramErr(err, n.cfg.TelegramBotToken)).Msg("telegram getUpdates failed")
			time.Sleep(3 * time.Second)
			continue
		}
		for _, u := range updates {
			offset = u.UpdateID + 1
			if !n.markUpdateSeen(u.UpdateID) {
				continue
			}
			if u.Message != nil && u.Message.Text != "" {
				n.log.Scanner.Debug().Str("text", u.Message.Text).Int64("chat", u.Message.Chat.ID).Msg("telegram message")
				n.handleMessage(ctx, u.Message)
			}
			if u.CallbackQuery != nil {
				n.handleCallback(ctx, u.CallbackQuery)
			}
		}
		time.Sleep(300 * time.Millisecond)
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
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=20", n.cfg.TelegramBotToken, offset)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := n.pollClient.Do(req)
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

func (n *Notifier) markUpdateSeen(id int) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	if _, ok := n.seenUpdates[id]; ok {
		return false
	}
	n.seenUpdates[id] = struct{}{}
	if len(n.seenUpdates) > 500 {
		for k := range n.seenUpdates {
			if k < id-200 {
				delete(n.seenUpdates, k)
			}
		}
	}
	return true
}

func sanitizeTelegramErr(err error, token string) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if token != "" {
		s = strings.ReplaceAll(s, token, "***")
	}
	return s
}

func (n *Notifier) handleMessage(ctx context.Context, msg *tgMessage) {
	chatID := msg.Chat.ID
	text := strings.TrimSpace(msg.Text)
	cmd := normalizeCommand(text)

	switch {
	case cmd == "/start" || cmd == "/subscribe":
		n.handleStart(ctx, chatID, msg.From)
	case cmd == "/stop" || text == btnUnsubscribe:
		n.handleStop(ctx, chatID)
	case cmd == "/help":
		n.sendHelp(ctx, chatID)
	case text == btnLogs || cmd == "/logs":
		n.sendLogs(ctx, chatID)
	case text == btnTest || cmd == "/test":
		n.sendTestSignal(ctx, chatID)
	case text == btnDemoTrade || cmd == "/demotrade":
		n.sendDemoTradeTest(ctx, chatID)
	case text == btnTraders || cmd == "/traders":
		n.sendTradersOverview(ctx, chatID)
	case text == btnSignalLogs || cmd == "/signallogs":
		n.toggleSignalLogs(ctx, chatID)
	case strings.HasPrefix(cmd, "/trader"):
		n.sendTraderDetail(ctx, chatID, cmd)
	case strings.HasPrefix(cmd, "/history"):
		n.sendTraderHistory(ctx, chatID, cmd)
	case text == btnStats || cmd == "/stats":
		n.sendStats(ctx, chatID)
	case text == btnTop || cmd == "/top":
		n.sendTop(ctx, chatID)
	case isCheckButton(text) || cmd == "/check":
		n.sendCheck(ctx, chatID)
	case cmd == "/unmute" || text == btnUnmute:
		n.clearMute(ctx, chatID)
	case strings.HasPrefix(cmd, "/mute") || text == btnMute:
		mins := n.parseMuteMinutes(cmd, text)
		n.setMute(ctx, chatID, time.Duration(mins)*time.Minute)
	default:
		if strings.HasPrefix(text, "/") {
			_ = n.sendToChat(ctx, chatID, "Неизвестная команда. Нажмите /start для обновления меню", mainMenuKeyboard())
		}
	}
}

func (n *Notifier) handleCallback(ctx context.Context, cb *tgCallback) {
	chatID := cb.Message.Chat.ID
	switch {
	case cb.Data == "logs":
		n.sendLogs(ctx, chatID)
	case cb.Data == "test":
		n.sendTestSignal(ctx, chatID)
	case cb.Data == "check":
		n.sendCheck(ctx, chatID)
	case cb.Data == "demo_trade":
		n.sendDemoTradeTest(ctx, chatID)
	case cb.Data == "traders":
		n.sendTradersOverview(ctx, chatID)
	case cb.Data == "traders:overall":
		n.sendTradersOverview(ctx, chatID)
	case strings.HasPrefix(cb.Data, "trader:"):
		id := strings.TrimPrefix(cb.Data, "trader:")
		n.sendTraderDetail(ctx, chatID, "/trader "+id)
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
				"Вы подписаны на сигналы.\n"+
				"Версия бота: <code>%s</code>\n\n"+
				"👥 Подписчиков: <b>%d</b>\n\n"+
				"Команды: /check /test /stats\n"+
				"Или кнопки ниже:",
			name, market.BuildVersion, n.subscribers.Count(),
		)
	} else {
		welcome = fmt.Sprintf(
			"✅ Вы уже подписаны, <b>%s</b>!\n\n"+
				"Версия: <code>%s</code>\n"+
				"👥 Подписчиков: <b>%d</b>\n\n"+
				"Меню обновлено ↓",
			name, market.BuildVersion, n.subscribers.Count(),
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
		"💹 Тест autotrade — demo-сделка ~$100 BTC\n" +
		"👥 Трейдеры — Саша, Дима, Ваня, Коля, Миша + ROI stats\n" +
		"🔇 Мут 1ч — временно без сигналов\n" +
		"🔔 Снять мут — /unmute\n" +
		"/mute 30 — мут на N минут\n" +
		"<i>Фильтр score ≥60 — только Telegram. Трейдеры (в т.ч. Миша) paper-торгуют от 35+.</i>\n" +
		"🔍 Проверка — диагностика WS и монет\n" +
		"📊 Статус — uptime и метрики\n" +
		"🏆 Топ сигналов — последние 5"
	_ = n.sendToChat(ctx, chatID, help, mainMenuKeyboard())
}

func (n *Notifier) sendLogs(ctx context.Context, chatID int64) {
	var b strings.Builder
	b.WriteString("📋 <b>Логи</b>\n━━━━━━━━━━━━━━━━━━━━\n\n")

	if signals, err := readLogTail(n.cfg.LogDir, "signals.log", 15); err == nil {
		b.WriteString("<b>signals.log</b>\n")
		b.WriteString(signals)
		b.WriteString("\n\n")
	} else {
		fmt.Fprintf(&b, "❌ signals: %s\n\n", err.Error())
	}
	if scannerLog, err := readLogTail(n.cfg.LogDir, "scanner.log", 8); err == nil {
		b.WriteString("<b>scanner.log</b>\n")
		b.WriteString(scannerLog)
		b.WriteString("\n\n")
	}
	if errorsLog, err := readLogTail(n.cfg.LogDir, "errors.log", 8); err == nil {
		b.WriteString("<b>errors.log</b>\n")
		b.WriteString(errorsLog)
	}

	text := b.String()
	if len(text) > 4000 {
		text = text[:3990] + "\n…"
	}
	_ = n.sendToChat(ctx, chatID, text, mainMenuKeyboard())
}

func (n *Notifier) sendTestSignal(ctx context.Context, chatID int64) {
	sig := mockTestSignal()
	rec := risk.TradeRecommendation{
		Signal:         sig,
		Side:           risk.SideLong,
		Mode:           risk.ModeDemo,
		Entry:          sig.Price * 1.0005,
		StopLoss:       sig.SuggestedSL,
		TakeProfit:     sig.SuggestedTP,
		SLMethod:       "ATR",
		Leverage:       5,
		LeverageReason: "TEST_SIGNAL cap",
		NotionalUSDT:   2500,
		MarginUSDT:     500,
		RiskUSDT:       18.75,
		RiskPct:        0.75,
		RiskReward:     2.0,
		SLDistancePct:  1.8,
		TPDistancePct:  3.6,
		LiqPrice:       sig.Price * 0.84,
		LiqDistancePct: 16,
		SLToLiqBuffer:  3.2,
		Verdict:        risk.VerdictApproved,
		MaxPositions:   8,
		Bucket:         "majors",
		BucketMax:      2,
		Timestamp:      sig.Timestamp,
	}
	text := "🧪 <b>Тестовый сигнал</b> (не реальный рынок)\n\n" + risk.FormatTelegramHTML(rec)
	keyboard := buildSignalInlineKeyboard(sig.Symbol)
	_ = n.sendToChat(ctx, chatID, text, keyboard)
}

func (n *Notifier) sendDemoTradeTest(ctx context.Context, chatID int64) {
	if n.demoTrader == nil || !n.demoTrader.Configured() {
		_ = n.sendToChat(ctx, chatID,
			"❌ <b>Demo API не настроен</b>\n\n"+
				"Добавь в <code>.env</code>:\n"+
				"<code>BYBIT_DEMO_API_KEY</code>\n"+
				"<code>BYBIT_DEMO_API_SECRET</code>\n"+
				"<code>BYBIT_DEMO_REST_URL=https://api-demo.bybit.com</code>\n"+
				"<code>AUTO_TRADE_DEMO=true</code>",
			mainMenuKeyboard())
		return
	}

	_ = n.sendToChat(ctx, chatID, "⏳ Открываю <b>demo</b> market long ~$100 (BTCUSDT)...", mainMenuKeyboard())

	result, err := n.demoTrader.RunTestTrade(ctx)
	balance, _ := n.demoTrader.FetchWalletUSDT(ctx)
	if err != nil {
		n.log.Errors.Error().Err(err).Int64("chat_id", chatID).Msg("demo test trade failed")
		_ = n.sendToChat(ctx, chatID, "❌ <b>Demo trade failed</b>\n\n<code>"+err.Error()+"</code>", mainMenuKeyboard())
		return
	}

	text := execution.FormatTestTradeHTML(result, balance, n.demoTrader.Enabled())
	_ = n.sendToChat(ctx, chatID, text, buildSignalInlineKeyboard(result.Symbol))
	n.log.Scanner.Info().Int64("chat_id", chatID).Str("order_id", result.OrderID).Msg("demo test trade via telegram")
}

func (n *Notifier) sendTradersOverview(ctx context.Context, chatID int64) {
	if n.traderMgr == nil {
		_ = n.sendToChat(ctx, chatID, "👥 Multi-trader mode не активен", mainMenuKeyboard())
		return
	}
	views, overall := n.traderMgr.Dashboard()
	text := traders.FormatDashboardHTML(views, overall, n.traderMgr.DemoAutotradeEnabled())
	_ = n.sendToChat(ctx, chatID, text, traders.TradersInlineKeyboard())
}

func (n *Notifier) sendTraderDetail(ctx context.Context, chatID int64, cmd string) {
	if n.traderMgr == nil {
		return
	}
	id := strings.TrimSpace(strings.TrimPrefix(cmd, "/trader"))
	id = strings.TrimPrefix(id, " ")
	if id == "" || id == "/trader" {
		n.sendTradersOverview(ctx, chatID)
		return
	}
	id = traders.ResolveProfileID(id)
	p, s, ok := n.traderMgr.ProfileByID(id)
	if !ok {
		_ = n.sendToChat(ctx, chatID, "Трейдер не найден.\n\nПопробуй:\n/trader саша · дима · ваня · коля · миша", traders.TradersInlineKeyboard())
		return
	}
	history, _ := n.traderMgr.History(id, 5)
	text := traders.FormatTraderDetailHTML(p, s, n.traderMgr.EquityPerTrader(), n.traderMgr.DemoAutotradeEnabled(), history)
	_ = n.sendToChat(ctx, chatID, text, traders.TradersInlineKeyboard())
}

func (n *Notifier) sendTraderHistory(ctx context.Context, chatID int64, cmd string) {
	if n.traderMgr == nil {
		return
	}
	id := strings.TrimSpace(strings.TrimPrefix(cmd, "/history"))
	id = traders.ResolveProfileID(id)
	p, s, ok := n.traderMgr.ProfileByID(id)
	if !ok {
		_ = n.sendToChat(ctx, chatID, "Трейдер не найден. Пример: /history миша", traders.TradersInlineKeyboard())
		return
	}
	history, _ := n.traderMgr.History(id, 20)
	text := traders.FormatTraderDetailHTML(p, s, n.traderMgr.EquityPerTrader(), n.traderMgr.DemoAutotradeEnabled(), history)
	_ = n.sendToChat(ctx, chatID, text, traders.TradersInlineKeyboard())
}

func (n *Notifier) sendStats(ctx context.Context, chatID int64) {
	if n.health == nil {
		return
	}
	uptime, total, today, reconnects, eventsTotal, eventsMin, lastAge, lastSym := n.health.Stats()
	openPaper := 0
	if n.journal != nil {
		openPaper = n.journal.OpenCount()
	}

	text := fmt.Sprintf(
		"📊 <b>Scanner Stats</b>\n\n"+
			"%s\n"+
			"Mode: LIVE\n"+
			"Uptime: %s\n"+
			"Last event: %s ago\n"+
			"Events/min: %d (total %d)\n"+
			"Symbols: %d\n"+
			"Signals total: %d (today %d)\n"+
			"WS reconnects: %d\n"+
			"Last signal: %s\n"+
			"Paper open: %d\n"+
			"👥 Subscribers: %d\n"+
			"%s",
		n.health.WSStatus(), uptime.Truncate(time.Second), lastAge.Truncate(time.Second),
		eventsMin, eventsTotal, n.getSymbolCount(),
		total, today, reconnects, lastSym, openPaper, n.subscribers.Count(),
		n.muteStatusLine(chatID),
	)
	_ = n.sendToChat(ctx, chatID, text, mainMenuKeyboard())
}

func (n *Notifier) sendCheck(ctx context.Context, chatID int64) {
	rest := market.NewRESTClient(n.cfg, n.log)
	report := market.RunCheck(ctx, rest, n.cfg, n.health, n.getSymbolCount())
	_ = n.sendToChat(ctx, chatID, report.TelegramHTML(), mainMenuKeyboard())
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

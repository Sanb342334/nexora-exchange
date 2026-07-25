package market

import (
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
	"bybit-scanner/internal/logger"
)

type RESTClient struct {
	baseURL    string
	httpClient *http.Client
	log        *logger.Loggers
}

type apiResult struct {
	RetCode int             `json:"retCode"`
	RetMsg  string          `json:"retMsg"`
	Result  json.RawMessage `json:"result"`
}

type tickerResult struct {
	List []tickerItem `json:"list"`
}

type tickerItem struct {
	Symbol       string `json:"symbol"`
	Turnover24h  string `json:"turnover24h"`
	LastPrice    string `json:"lastPrice"`
	FundingRate  string `json:"fundingRate"`
	OpenInterest string `json:"openInterest"`
}

type oiResult struct {
	List []oiItem `json:"list"`
}

type oiItem struct {
	OpenInterest string `json:"openInterest"`
	Timestamp    string `json:"timestamp"`
}

type lsResult struct {
	List []lsItem `json:"list"`
}

type lsItem struct {
	Symbol         string `json:"symbol"`
	BuyRatio       string `json:"buyRatio"`
	SellRatio      string `json:"sellRatio"`
	LongShortRatio string `json:"longShortRatio"`
}

func NewRESTClient(cfg *config.Config, log *logger.Loggers) *RESTClient {
	return &RESTClient{
		baseURL: strings.TrimRight(cfg.BybitRESTURL, "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
		log: log,
	}
}

func (c *RESTClient) FetchActiveUSDTPairs(ctx context.Context, minVolume24H float64) ([]string, error) {
	url := fmt.Sprintf("%s/v5/market/tickers?category=linear", c.baseURL)
	body, err := c.doGET(ctx, url)
	if err != nil {
		return nil, err
	}

	var resp apiResult
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode tickers: %w", err)
	}
	if resp.RetCode != 0 {
		return nil, fmt.Errorf("bybit tickers error: %s", resp.RetMsg)
	}

	var result tickerResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}

	var symbols []string
	for _, item := range result.List {
		if !strings.HasSuffix(item.Symbol, "USDT") {
			continue
		}
		turnover, err := strconv.ParseFloat(item.Turnover24h, 64)
		if err != nil {
			continue
		}
		if turnover >= minVolume24H {
			symbols = append(symbols, item.Symbol)
		}
	}

	if len(symbols) == 0 {
		return nil, fmt.Errorf("no symbols matched min volume %.0f", minVolume24H)
	}

	c.log.Scanner.Info().Int("count", len(symbols)).Float64("min_volume_24h", minVolume24H).
		Msg("loaded active USDT linear pairs")
	return symbols, nil
}

func (c *RESTClient) FetchOpenInterest(ctx context.Context, symbol string) (float64, time.Time, error) {
	url := fmt.Sprintf("%s/v5/market/open-interest?category=linear&symbol=%s&intervalTime=5min&limit=1", c.baseURL, symbol)
	body, err := c.doGET(ctx, url)
	if err != nil {
		return 0, time.Time{}, err
	}

	var resp apiResult
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0, time.Time{}, err
	}
	if resp.RetCode != 0 {
		return 0, time.Time{}, fmt.Errorf("bybit oi error for %s: %s", symbol, resp.RetMsg)
	}

	var result oiResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return 0, time.Time{}, err
	}
	if len(result.List) == 0 {
		return 0, time.Time{}, fmt.Errorf("empty oi list for %s", symbol)
	}

	item := result.List[0]
	oi, err := strconv.ParseFloat(item.OpenInterest, 64)
	if err != nil {
		return 0, time.Time{}, err
	}
	tsMs, err := strconv.ParseInt(item.Timestamp, 10, 64)
	if err != nil {
		return oi, time.Now().UTC(), nil
	}
	return oi, time.UnixMilli(tsMs).UTC(), nil
}

func (c *RESTClient) FetchLongShortRatio(ctx context.Context, symbol string) (float64, error) {
	url := fmt.Sprintf("%s/v5/market/account-ratio?category=linear&symbol=%s&period=5min&limit=1", c.baseURL, symbol)
	body, err := c.doGET(ctx, url)
	if err != nil {
		return 0, err
	}

	var resp apiResult
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0, err
	}
	if resp.RetCode != 0 {
		return 0, fmt.Errorf("account-ratio %s: %s", symbol, resp.RetMsg)
	}

	var result lsResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return 0, err
	}
	if len(result.List) == 0 {
		return 0, fmt.Errorf("empty ls ratio for %s", symbol)
	}

	ratio, err := strconv.ParseFloat(result.List[0].LongShortRatio, 64)
	if err != nil {
		return 0, err
	}
	return ratio, nil
}

func (c *RESTClient) doGET(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, string(body))
	}
	return body, nil
}

type LSPoller struct {
	rest    *RESTClient
	store   *analyzer.Store
	cfg     *config.Config
	log     *logger.Loggers
	symbols []string
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	sem     chan struct{}
}

func NewLSPoller(rest *RESTClient, store *analyzer.Store, cfg *config.Config, log *logger.Loggers, symbols []string) *LSPoller {
	return &LSPoller{
		rest: rest, store: store, cfg: cfg, log: log, symbols: symbols,
		sem: make(chan struct{}, 6),
	}
}

func (p *LSPoller) Start(ctx context.Context) {
	ctx, p.cancel = context.WithCancel(ctx)
	p.wg.Add(1)
	go p.loop(ctx)
	p.log.Scanner.Info().Dur("interval", p.cfg.LSPollInterval).Msg("L/S ratio poller started")
}

func (p *LSPoller) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	p.wg.Wait()
}

func (p *LSPoller) loop(ctx context.Context) {
	defer p.wg.Done()
	ticker := time.NewTicker(p.cfg.LSPollInterval)
	defer ticker.Stop()
	p.pollAll(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.pollAll(ctx)
		}
	}
}

func (p *LSPoller) pollAll(ctx context.Context) {
	var wg sync.WaitGroup
	for _, symbol := range p.symbols {
		sym := symbol
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case p.sem <- struct{}{}:
				defer func() { <-p.sem }()
			case <-ctx.Done():
				return
			}
			ratio, err := p.rest.FetchLongShortRatio(ctx, sym)
			if err != nil {
				p.log.Errors.Debug().Str("symbol", sym).Err(err).Msg("ls ratio poll failed")
				return
			}
			p.store.Ensure(sym).UpdateLongShortRatio(ratio)
		}()
	}
	wg.Wait()
}

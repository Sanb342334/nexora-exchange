package execution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type apiResponse struct {
	RetCode int             `json:"retCode"`
	RetMsg  string          `json:"retMsg"`
	Result  json.RawMessage `json:"result"`
}

type Client struct {
	cfg  Config
	http *http.Client
}

func NewClient(cfg Config) *Client {
	return &Client{
		cfg: cfg,
		http: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) GetPublic(ctx context.Context, path, query string) (json.RawMessage, error) {
	url := c.cfg.BaseURL + path
	if query != "" {
		url += "?" + query
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return c.do(req)
}

func (c *Client) GetSigned(ctx context.Context, path, query string) (json.RawMessage, error) {
	if err := ensureDemoHost(c.cfg.BaseURL); err != nil {
		return nil, err
	}
	url := c.cfg.BaseURL + path
	if query != "" {
		url += "?" + query
	}
	ts, sign := signGet(c.cfg.APISecret, c.cfg.APIKey, c.cfg.RecvWindow, query)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	c.setAuthHeaders(req, ts, sign)
	return c.do(req)
}

func (c *Client) PostSigned(ctx context.Context, path string, payload map[string]interface{}) (json.RawMessage, error) {
	if err := ensureDemoHost(c.cfg.BaseURL); err != nil {
		return nil, err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	ts, sign := signRequest(c.cfg.APISecret, c.cfg.APIKey, c.cfg.RecvWindow, string(body))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	c.setAuthHeaders(req, ts, sign)
	return c.do(req)
}

func (c *Client) setAuthHeaders(req *http.Request, ts, sign string) {
	req.Header.Set("X-BAPI-API-KEY", c.cfg.APIKey)
	req.Header.Set("X-BAPI-SIGN", sign)
	req.Header.Set("X-BAPI-TIMESTAMP", ts)
	req.Header.Set("X-BAPI-RECV-WINDOW", fmt.Sprintf("%d", c.cfg.RecvWindow))
}

func (c *Client) do(req *http.Request) (json.RawMessage, error) {
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	var resp apiResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("decode response: %w (body: %s)", err, truncate(string(raw), 200))
	}
	if resp.RetCode != 0 {
		return nil, fmt.Errorf("bybit API %d: %s", resp.RetCode, resp.RetMsg)
	}
	return resp.Result, nil
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

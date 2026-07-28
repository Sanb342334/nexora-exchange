package execution

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func signPayload(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func signRequest(secret, apiKey string, recvWindow int, body string) (timestamp, signature string) {
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	payload := ts + apiKey + strconv.Itoa(recvWindow) + body
	return ts, signPayload(secret, payload)
}

func signGet(secret, apiKey string, recvWindow int, query string) (timestamp, signature string) {
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	payload := ts + apiKey + strconv.Itoa(recvWindow) + query
	return ts, signPayload(secret, payload)
}

func ensureDemoHost(baseURL string) error {
	parsed, err := url.Parse(baseURL)
	if err != nil || !strings.EqualFold(parsed.Hostname(), "api-demo.bybit.com") || parsed.Scheme != "https" {
		return fmt.Errorf("execution blocked: base URL must be api-demo.bybit.com, got %s", baseURL)
	}
	return nil
}

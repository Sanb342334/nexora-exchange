package execution

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func controlTestTrader(handler roundTripFunc) *DemoTrader {
	cfg := Config{APIKey: "key", APISecret: "secret", BaseURL: "https://api-demo.bybit.com", RecvWindow: 5000}
	return &DemoTrader{
		cfg: cfg, client: &Client{cfg: cfg, http: &http.Client{Transport: handler}},
		symbolLocks: make(map[string]*sync.Mutex), managed: map[string]ManagedDemoPosition{
			"BTCUSDT": {IntentID: "intent-1", OrderID: "entry-1", Symbol: "BTCUSDT", Side: "Buy", EntryPrice: 100, OriginalStop: 95, OriginalTP: 110},
		},
	}
}

func bybitResult(t *testing.T, value interface{}) *http.Response {
	t.Helper()
	body, err := json.Marshal(map[string]interface{}{"retCode": 0, "retMsg": "OK", "result": value})
	if err != nil {
		t.Fatal(err)
	}
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(string(body)))}
}

func positionResponse(t *testing.T, size, sl, tp string) *http.Response {
	t.Helper()
	return bybitResult(t, map[string]interface{}{"list": []map[string]string{{
		"size": size, "side": "Buy", "avgPrice": "100", "markPrice": "102", "stopLoss": sl, "takeProfit": tp,
	}}})
}

func TestDemoPositionRejectsUnmanagedPosition(t *testing.T) {
	trader := controlTestTrader(func(r *http.Request) (*http.Response, error) {
		t.Fatal("unexpected exchange request")
		return nil, nil
	})
	_, err := trader.DemoPosition(context.Background(), "ETHUSDT")
	if err == nil || !strings.Contains(err.Error(), "not a bot-owned") {
		t.Fatalf("DemoPosition error = %v, want bot-owned rejection", err)
	}
}

func TestUpdateProtectionReportsWideningAndVerifiesBybitState(t *testing.T) {
	var tradingStop map[string]interface{}
	trader := controlTestTrader(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v5/position/list":
			if tradingStop == nil {
				return positionResponse(t, "2", "98", "110"), nil
			}
			return positionResponse(t, "2", "90", "120"), nil
		case "/v5/position/trading-stop":
			defer r.Body.Close()
			if err := json.NewDecoder(r.Body).Decode(&tradingStop); err != nil {
				t.Fatal(err)
			}
			return bybitResult(t, map[string]string{}), nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})
	result, err := trader.UpdateProtection(context.Background(), "BTCUSDT", 90, 120)
	if err != nil {
		t.Fatalf("UpdateProtection: %v", err)
	}
	if !result.RiskWidening || result.RiskIncreasePerUnit != 8 {
		t.Fatalf("widening preview = %+v, want 8-unit widening", result)
	}
	if got := tradingStop["stopLoss"]; got != "90.0000" {
		t.Fatalf("stopLoss request = %#v", got)
	}
	if result.Position.StopLoss != 90 || result.Position.TakeProfit != 120 {
		t.Fatalf("unverified result %+v", result.Position)
	}
}

func TestClosePositionUsesReduceOnlyPartialAndVerifiesRemainingSize(t *testing.T) {
	var closeOrder map[string]interface{}
	positionReads := 0
	trader := controlTestTrader(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v5/position/list":
			positionReads++
			if positionReads == 1 {
				return positionResponse(t, "2", "98", "110"), nil
			}
			return positionResponse(t, "1.5", "98", "110"), nil
		case "/v5/market/instruments-info":
			return bybitResult(t, map[string]interface{}{"list": []map[string]interface{}{{"lotSizeFilter": map[string]string{"qtyStep": "0.1", "minOrderQty": "0.1"}}}}), nil
		case "/v5/order/create":
			defer r.Body.Close()
			if err := json.NewDecoder(r.Body).Decode(&closeOrder); err != nil {
				t.Fatal(err)
			}
			return bybitResult(t, map[string]string{"orderId": "close-1"}), nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})
	result, err := trader.ClosePosition(context.Background(), "BTCUSDT", 0.5)
	if err != nil {
		t.Fatalf("ClosePosition: %v", err)
	}
	if result.FullyClosed || result.ClosedQuantity != 0.5 || result.RemainingSize != 1.5 {
		t.Fatalf("close result = %+v", result)
	}
	if closeOrder["reduceOnly"] != true || closeOrder["side"] != "Sell" || closeOrder["qty"] != "0.5" {
		t.Fatalf("close payload = %#v", closeOrder)
	}
}

func TestClosePositionFullUsesExchangeQuantityAndRemovesOwnership(t *testing.T) {
	var closeOrder map[string]interface{}
	reads := 0
	trader := controlTestTrader(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v5/position/list":
			reads++
			if reads <= 2 { // initial detail and fresh full-close quantity
				return positionResponse(t, "2.3", "98", "110"), nil
			}
			return positionResponse(t, "0", "0", "0"), nil
		case "/v5/order/create":
			defer r.Body.Close()
			if err := json.NewDecoder(r.Body).Decode(&closeOrder); err != nil {
				t.Fatal(err)
			}
			return bybitResult(t, map[string]string{"orderId": "close-2"}), nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})
	result, err := trader.ClosePosition(context.Background(), "BTCUSDT", 0)
	if err != nil {
		t.Fatalf("ClosePosition: %v", err)
	}
	if !result.FullyClosed || result.ClosedQuantity != 2.3 || closeOrder["qty"] != "2.3" {
		t.Fatalf("full close result=%+v payload=%#v", result, closeOrder)
	}
	if _, err := trader.DemoPosition(context.Background(), "BTCUSDT"); err == nil {
		t.Fatal("position remained controllable after verified full close")
	}
}

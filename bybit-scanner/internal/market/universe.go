package market

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"bybit-scanner/internal/logger"
)

// UniverseReport describes how candidate symbols were resolved. It is written
// to the structured scanner log so a deployment never silently subscribes to
// stock, stablecoin, delisted, or malformed instruments.
type UniverseReport struct {
	Candidates int
	Accepted   int
	Rejected   map[string]string
	Source     string
}

var linearUSDTSymbol = regexp.MustCompile(`^[A-Z0-9]+USDT$`)

// These bases are cash/stablecoin products, not directional crypto futures.
// The set is intentionally small and transparent; exchange metadata remains
// the primary source of truth.
var stablecoinBases = map[string]struct{}{
	"USDT": {}, "USDC": {}, "USDE": {}, "USDS": {}, "USDD": {},
	"USDF": {}, "USD1": {}, "FDUSD": {}, "PYUSD": {}, "RLUSD": {},
}

// Stock and ETF perpetuals share the linear API category with crypto
// contracts. Bybit does not expose one stable cross-region asset-class field
// on every instrument response, so this conservative deny-list prevents the
// supplied mixed universe from entering the crypto strategy.
var traditionalAssetBases = map[string]struct{}{
	"AAPL": {}, "ADBE": {}, "AEHR": {}, "AMD": {}, "AMAT": {}, "AMZN": {},
	"APP": {}, "ARM": {}, "ASML": {}, "AVGO": {}, "BABA": {}, "CAT": {},
	"CIEN": {}, "COHR": {}, "COIN": {}, "COST": {}, "CRM": {}, "CRWD": {},
	"CSCO": {}, "DELL": {}, "DKNG": {}, "EWJ": {}, "EWY": {}, "GLW": {},
	"GOOGL": {}, "HIMS": {}, "HOOD": {}, "HPE": {}, "HYUNDAI": {}, "IBM": {},
	"INTC": {}, "INTW": {}, "IONQ": {}, "IREN": {}, "IWM": {}, "KLAC": {},
	"LLY": {}, "LRCX": {}, "MARA": {}, "META": {}, "MRVL": {}, "MSFT": {},
	"MSTR": {}, "MVLL": {}, "NBIS": {}, "NFLX": {}, "NOKIA": {}, "NVDA": {},
	"NVDL": {}, "PANW": {}, "PLTR": {}, "QCOM": {}, "QQQ": {}, "RDW": {},
	"RIVN": {}, "RKLB": {}, "SAMSUNG": {}, "SKHYNIX": {}, "SMCI": {},
	"SMH": {}, "SNDK": {}, "SNOW": {}, "SOFI": {}, "SONY": {}, "SOXL": {},
	"SOXS": {}, "SOXX": {}, "SPY": {}, "SQQQ": {}, "TSLA": {}, "TSLL": {},
	"TSM": {}, "TQQQ": {}, "TSEM": {}, "TTWO": {}, "TXN": {}, "TZA": {},
	"UVXY": {},
}

func baseCoin(symbol string) string {
	return strings.TrimSuffix(strings.ToUpper(strings.TrimSpace(symbol)), "USDT")
}

func validCryptoCandidate(symbol string) (string, bool, string) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if !linearUSDTSymbol.MatchString(symbol) {
		return symbol, false, "invalid_linear_usdt_symbol"
	}
	base := baseCoin(symbol)
	if _, ok := stablecoinBases[base]; ok {
		return symbol, false, "stablecoin_base"
	}
	if _, ok := traditionalAssetBases[base]; ok {
		return symbol, false, "non_crypto_underlying"
	}
	return symbol, true, ""
}

// FilterCryptoCandidates removes obvious non-crypto entries before either a
// REST validation or a geo-block fallback. The returned report is suitable for
// monitoring and tests.
func FilterCryptoCandidates(candidates []string, source string) ([]string, UniverseReport) {
	report := UniverseReport{
		Candidates: len(candidates),
		Rejected:   make(map[string]string),
		Source:     source,
	}
	seen := make(map[string]struct{}, len(candidates))
	accepted := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		symbol, ok, reason := validCryptoCandidate(candidate)
		if !ok {
			if symbol != "" {
				report.Rejected[symbol] = reason
			}
			continue
		}
		if _, duplicate := seen[symbol]; duplicate {
			report.Rejected[symbol] = "duplicate"
			continue
		}
		seen[symbol] = struct{}{}
		accepted = append(accepted, symbol)
	}
	sort.Strings(accepted)
	report.Accepted = len(accepted)
	return accepted, report
}

func logUniverseReport(log *logger.Loggers, report UniverseReport) {
	reasons := make(map[string]int)
	for _, reason := range report.Rejected {
		reasons[reason]++
	}
	log.Scanner.Info().
		Str("source", report.Source).
		Int("candidates", report.Candidates).
		Int("accepted", report.Accepted).
		Int("rejected", len(report.Rejected)).
		Interface("rejection_reasons", reasons).
		Msg("crypto universe resolved")
}

type instrumentInfoResult struct {
	Category       string `json:"category"`
	NextPageCursor string `json:"nextPageCursor"`
	List           []struct {
		Symbol       string `json:"symbol"`
		Status       string `json:"status"`
		ContractType string `json:"contractType"`
		BaseCoin     string `json:"baseCoin"`
		QuoteCoin    string `json:"quoteCoin"`
		SettleCoin   string `json:"settleCoin"`
	} `json:"list"`
}

// ValidateCryptoUniverse intersects candidates with instruments that are
// currently trading USDT-settled linear perpetuals. It deliberately leaves
// fallback handling to the caller: a transport/geo failure must never turn
// into an empty universe.
func (c *RESTClient) ValidateCryptoUniverse(ctx context.Context, candidates []string) ([]string, error) {
	if len(candidates) == 0 {
		return nil, fmt.Errorf("empty candidate universe")
	}
	active, err := c.fetchActiveLinearInstruments(ctx)
	if err != nil {
		return nil, err
	}
	validated := make([]string, 0, len(candidates))
	for _, symbol := range candidates {
		if _, ok := active[symbol]; ok {
			validated = append(validated, symbol)
		}
	}
	if len(validated) == 0 {
		return nil, fmt.Errorf("no candidate symbols are active Bybit crypto USDT linear instruments")
	}
	return validated, nil
}

func (c *RESTClient) fetchActiveLinearInstruments(ctx context.Context) (map[string]struct{}, error) {
	cursor := ""
	active := make(map[string]struct{})
	for page := 0; page < 20; page++ {
		url := fmt.Sprintf("%s/v5/market/instruments-info?category=linear&limit=1000", c.baseURL)
		if cursor != "" {
			url += "&cursor=" + cursor
		}
		body, err := c.doGET(ctx, url)
		if err != nil {
			return nil, err
		}
		var response apiResult
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, fmt.Errorf("decode instruments: %w", err)
		}
		if response.RetCode != 0 {
			return nil, fmt.Errorf("bybit instruments error: %s", response.RetMsg)
		}
		var result instrumentInfoResult
		if err := json.Unmarshal(response.Result, &result); err != nil {
			return nil, fmt.Errorf("decode instrument list: %w", err)
		}
		for _, item := range result.List {
			symbol, ok, _ := validCryptoCandidate(item.Symbol)
			if !ok ||
				!strings.EqualFold(item.Status, "Trading") ||
				!strings.EqualFold(item.ContractType, "LinearPerpetual") ||
				!strings.EqualFold(item.QuoteCoin, "USDT") ||
				!strings.EqualFold(item.SettleCoin, "USDT") {
				continue
			}
			if item.BaseCoin != "" && !strings.EqualFold(baseCoin(symbol), item.BaseCoin) {
				continue
			}
			active[symbol] = struct{}{}
		}
		cursor = result.NextPageCursor
		if cursor == "" {
			return active, nil
		}
	}
	return nil, fmt.Errorf("Bybit instruments pagination limit reached")
}

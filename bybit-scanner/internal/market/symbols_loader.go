package market

import (
	"bufio"
	"context"
	"os"
	"strings"
	"time"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/logger"
)

const BuildVersion = "20260725-hardened-demo-v9"

func IsGeoBlock(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "403") ||
		strings.Contains(s, "cloudfront") ||
		strings.Contains(s, "block access from your country")
}

func LoadSymbolsFromFile(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	seen := make(map[string]struct{})
	var out []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		sym := strings.ToUpper(line)
		if _, ok := seen[sym]; ok {
			continue
		}
		seen[sym] = struct{}{}
		out = append(out, sym)
	}
	return out, sc.Err()
}

func LoadSymbols(
	ctx context.Context,
	rest *RESTClient,
	cfg *config.Config,
	log *logger.Loggers,
) []string {
	if syms := cfg.StaticSymbols(); len(syms) > 0 {
		log.Scanner.Info().Int("count", len(syms)).Str("version", BuildVersion).Msg("SYMBOLS from env")
		return syms
	}

	if cfg.UseDefaultSymbols() {
		path := cfg.SymbolsFile
		if syms, err := LoadSymbolsFromFile(path); err == nil && len(syms) > 0 {
			log.Scanner.Info().
				Int("count", len(syms)).
				Str("file", path).
				Str("version", BuildVersion).
				Msg("symbol list from file")
			return syms
		} else if err != nil {
			log.Errors.Warn().Err(err).Str("file", path).Msg("symbols file not loaded")
		}
	}

	if !cfg.UseDefaultSymbols() {
		for attempt := 1; attempt <= 3; attempt++ {
			symbols, err := rest.FetchActiveUSDTPairs(ctx, cfg.MinVolume24H)
			if err == nil {
				log.Scanner.Info().Int("count", len(symbols)).Str("version", BuildVersion).Msg("symbols from Bybit REST")
				return symbols
			}
			if IsGeoBlock(err) {
				log.Errors.Warn().Err(err).Msg("geo-block on REST, trying symbols.list file")
				break
			}
			log.Errors.Warn().Int("attempt", attempt).Err(err).Msg("load symbols retry")
			select {
			case <-ctx.Done():
				break
			case <-time.After(3 * time.Second):
			}
		}
	}

	path := cfg.SymbolsFile
	if syms, err := LoadSymbolsFromFile(path); err == nil && len(syms) > 0 {
		log.Scanner.Info().Int("count", len(syms)).Str("file", path).Str("version", BuildVersion).Msg("fallback symbol file")
		return syms
	}

	log.Errors.Warn().Str("version", BuildVersion).Msg("no symbols loaded")
	return nil
}

func TunePollIntervals(cfg *config.Config, symbolCount int) {
	if symbolCount > 80 {
		cfg.OIPollInterval = 30 * time.Second
		cfg.LSPollInterval = 120 * time.Second
		cfg.WSShardSize = 25
	} else if symbolCount > 40 {
		cfg.OIPollInterval = 20 * time.Second
		cfg.LSPollInterval = 90 * time.Second
	}
}

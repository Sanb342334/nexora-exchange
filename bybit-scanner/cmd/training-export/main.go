// training-export projects immutable signal features and deferred labels from
// the SQLite ledger. It opens the ledger read-only and cannot affect trading.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"bybit-scanner/internal/signals"
)

func main() {
	logDir := flag.String("log-dir", "logs", "scanner log directory")
	format := flag.String("format", "csv", "output format: csv or jsonl")
	horizon := flag.Duration("horizon", time.Hour, "outcome horizon: 1m, 5m, 15m, or 1h")
	costVersion := flag.String("cost-version", "", "required version for the after-cost model")
	entryFee := flag.String("entry-fee-bps", "", "required entry fee in bps")
	exitFee := flag.String("exit-fee-bps", "", "required exit fee in bps")
	slippage := flag.String("slippage-bps", "", "required slippage per side in bps")
	flag.Parse()

	costs, err := parseCosts(*costVersion, *entryFee, *exitFee, *slippage)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid costs: %v\n", err)
		os.Exit(2)
	}
	repo, err := signals.OpenReadOnly(filepath.Join(*logDir, "signals.db"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "open read-only signal ledger: %v\n", err)
		os.Exit(1)
	}
	defer repo.Close()
	rows, err := repo.TrainingRows(context.Background(), *horizon, costs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load training rows: %v\n", err)
		os.Exit(1)
	}
	switch *format {
	case "csv":
		err = signals.WriteTrainingCSV(os.Stdout, rows)
	case "jsonl":
		err = signals.WriteTrainingJSONL(os.Stdout, rows)
	default:
		err = fmt.Errorf("unsupported format %q (want csv or jsonl)", *format)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "write training export: %v\n", err)
		os.Exit(1)
	}
}

func parseCosts(version, entry, exit, slippage string) (signals.TrainingCosts, error) {
	if version == "" || entry == "" || exit == "" || slippage == "" {
		return signals.TrainingCosts{}, fmt.Errorf("--cost-version, --entry-fee-bps, --exit-fee-bps, and --slippage-bps are all required")
	}
	parse := func(name, value string) (float64, error) {
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil || parsed < 0 {
			return 0, fmt.Errorf("%s must be a non-negative number", name)
		}
		return parsed, nil
	}
	entryFee, err := parse("entry fee", entry)
	if err != nil {
		return signals.TrainingCosts{}, err
	}
	exitFee, err := parse("exit fee", exit)
	if err != nil {
		return signals.TrainingCosts{}, err
	}
	slippageBps, err := parse("slippage", slippage)
	if err != nil {
		return signals.TrainingCosts{}, err
	}
	costs := signals.TrainingCosts{Version: version, EntryFeeBps: entryFee, ExitFeeBps: exitFee, SlippageBps: slippageBps}
	if costs.TotalBps() <= 0 {
		return signals.TrainingCosts{}, fmt.Errorf("costs must be positive; zero-cost labels are unsafe")
	}
	return costs, nil
}

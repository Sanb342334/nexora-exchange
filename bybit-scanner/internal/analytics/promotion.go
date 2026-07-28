package analytics

import (
	"fmt"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/traders"
)

type PromotionDecision struct {
	Eligible bool
	Reasons  []string
}

// EvaluatePromotion is deliberately conservative: passing it only means that
// a strategy has evidence to request review, never that live execution is on.
func EvaluatePromotion(stats traders.Stats, failures int, cfg config.PromotionConfig) PromotionDecision {
	var reasons []string
	if stats.Closed() < cfg.MinClosedTrades {
		reasons = append(reasons, fmt.Sprintf("closed trades %d < %d", stats.Closed(), cfg.MinClosedTrades))
	}
	if stats.ProfitFactor() < cfg.MinProfitFactor {
		reasons = append(reasons, fmt.Sprintf("profit factor %.2f < %.2f", stats.ProfitFactor(), cfg.MinProfitFactor))
	}
	if stats.AverageR < cfg.MinExpectancyR {
		reasons = append(reasons, fmt.Sprintf("average R %.3f < %.3f", stats.AverageR, cfg.MinExpectancyR))
	}
	if stats.MaxDrawdown > cfg.MaxDrawdownUSDT {
		reasons = append(reasons, fmt.Sprintf("drawdown %.2f > %.2f", stats.MaxDrawdown, cfg.MaxDrawdownUSDT))
	}
	if failures > cfg.MaxExecutionFailures {
		reasons = append(reasons, fmt.Sprintf("execution failures %d > %d", failures, cfg.MaxExecutionFailures))
	}
	return PromotionDecision{Eligible: len(reasons) == 0, Reasons: reasons}
}

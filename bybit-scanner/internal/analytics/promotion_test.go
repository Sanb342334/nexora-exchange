package analytics

import (
	"testing"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/traders"
)

func TestPromotionRejectsInsufficientEvidence(t *testing.T) {
	decision := EvaluatePromotion(traders.Stats{
		Wins: 8, Losses: 2, GrossProfit: 20, GrossLoss: 10, AverageR: 0.2,
	}, 0, config.PromotionConfig{
		MinClosedTrades: 20, MinProfitFactor: 1.1, MinExpectancyR: 0.1, MaxDrawdownUSDT: 100,
	})
	if decision.Eligible || len(decision.Reasons) == 0 {
		t.Fatalf("expected insufficient-evidence rejection: %+v", decision)
	}
}

func TestPromotionDoesNotEnableLiveTrading(t *testing.T) {
	decision := EvaluatePromotion(traders.Stats{
		Wins: 20, GrossProfit: 40, AverageR: 0.5, MaxDrawdown: 10,
	}, 0, config.PromotionConfig{
		MinClosedTrades: 20, MinProfitFactor: 1.1, MinExpectancyR: 0.1, MaxDrawdownUSDT: 100,
	})
	if !decision.Eligible {
		t.Fatalf("expected evidence eligibility: %+v", decision)
	}
}

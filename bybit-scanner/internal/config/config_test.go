package config

import "testing"

func TestTrainingCostsRequireVersionAndPositiveRoundTripCost(t *testing.T) {
	valid := YAMLConfig{Training: TrainingConfig{
		Enabled: true, CostVersion: "bybit-demo-linear-taker/v1",
		EntryFeeBps: 6, ExitFeeBps: 6, SlippageBps: 3,
	}}
	applyYAMLDefaults(&valid)
	if err := validateYAML(&valid); err != nil {
		t.Fatalf("valid training costs rejected: %v", err)
	}

	valid.Training.CostVersion = ""
	if err := validateYAML(&valid); err == nil {
		t.Fatal("training cost version was not required")
	}

	valid.Training.CostVersion = "bybit-demo-linear-taker/v1"
	valid.Training.EntryFeeBps = 0
	valid.Training.ExitFeeBps = 0
	valid.Training.SlippageBps = 0
	if err := validateYAML(&valid); err == nil {
		t.Fatal("zero-cost training labels were accepted")
	}
}

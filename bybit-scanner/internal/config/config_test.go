package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveConfigPathLocalFallback(t *testing.T) {
	dir := t.TempDir()
	railway := filepath.Join(dir, "config.railway.yaml")
	if err := os.WriteFile(railway, []byte("thresholds:\n  min_score: 50\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })

	got := resolveConfigPath("config.local.yaml")
	if got != "config.railway.yaml" {
		t.Fatalf("expected config.railway.yaml fallback, got %q", got)
	}
}

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

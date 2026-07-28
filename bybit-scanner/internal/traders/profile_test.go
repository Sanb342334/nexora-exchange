package traders

import (
	"testing"

	"bybit-scanner/internal/analyzer"
	"bybit-scanner/internal/config"
)

func TestMishaDefaultIsTapeSyncDemo(t *testing.T) {
	profiles := DefaultProfiles(config.RiskConfig{})
	for _, profile := range profiles {
		if profile.ID != "misha" {
			continue
		}
		if profile.InvertSignals {
			t.Fatal("misha must not invert signals")
		}
		if profile.Strategy != "tape_sync" {
			t.Fatalf("misha strategy = %q, want tape_sync", profile.Strategy)
		}
		if profile.ExecutionMode != ExecutionDemoAggregate {
			t.Fatalf("misha execution mode = %q, want demo", profile.ExecutionMode)
		}
		return
	}
	t.Fatal("misha profile missing")
}

func TestKatyaAndOlegDefaults(t *testing.T) {
	profiles := DefaultProfiles(config.RiskConfig{})
	found := map[string]bool{}
	for _, profile := range profiles {
		switch profile.ID {
		case "katya":
			found["katya"] = profile.Strategy == "carry_arbitrage" && profile.EquityUSDT == 1000
		case "oleg":
			found["oleg"] = profile.Strategy == "indicator_mtf"
		}
	}
	if !found["katya"] {
		t.Fatal("katya carry profile missing or misconfigured")
	}
	if !found["oleg"] {
		t.Fatal("oleg indicator profile missing or misconfigured")
	}
}

func TestMergeProfilesUnknownExecutionModeFailsClosedToPaper(t *testing.T) {
	profiles := MergeProfiles(config.TradersConfig{Profiles: []config.TraderProfileYAML{{
		ID: "unsafe", ExecutionMode: "exchange_everything",
	}}}, config.RiskConfig{})
	if len(profiles) != 1 {
		t.Fatalf("profiles = %d, want 1", len(profiles))
	}
	if profiles[0].ExecutionMode != ExecutionPaper {
		t.Fatalf("execution mode = %q, want %q", profiles[0].ExecutionMode, ExecutionPaper)
	}
}

func TestMomentumOnlyRejectsFadeBeforeStrategyAcceptance(t *testing.T) {
	profile := Profile{
		MomentumOnly: true,
		Strategy:     "future_momentum_strategy",
		AllowFade:    true,
	}
	ok, reason := profile.Accepts(analyzer.Signal{AlertType: "FADE"})
	if ok || reason != "momentum_fade_disabled" {
		t.Fatalf("Accepts(FADE) = %v, %q; want false, momentum_fade_disabled", ok, reason)
	}
}

func TestPaperProfileNeverEntersDemoExecutionGroup(t *testing.T) {
	manager := &Manager{profiles: []runtimeProfile{
		{Profile: Profile{ID: "sniper", ExecutionMode: ExecutionDemoAggregate}},
		{Profile: Profile{ID: "misha", Strategy: "tape_sync", ExecutionMode: ExecutionPaper}},
	}}
	demo, paper := manager.partitionExecutionGroups([]approvedRecommendation{{index: 0}, {index: 1}})
	if len(demo) != 1 || demo[0].index != 0 {
		t.Fatalf("demo group = %#v, want only sniper", demo)
	}
	if len(paper) != 1 || paper[0].index != 1 {
		t.Fatalf("paper group = %#v, want only misha", paper)
	}
}

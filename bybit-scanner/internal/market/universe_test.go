package market

import "testing"

func TestFilterCryptoCandidates(t *testing.T) {
	got, report := FilterCryptoCandidates([]string{
		"BTCUSDT", "btcusdt", "SOLUSDT", "AAPLUSDT", "USDCUSDT",
		"bad symbol", "SPYUSDT",
	}, "test")

	want := map[string]bool{"BTCUSDT": true, "SOLUSDT": true}
	if len(got) != len(want) {
		t.Fatalf("accepted count = %d, want %d: %#v", len(got), len(want), got)
	}
	for _, symbol := range got {
		if !want[symbol] {
			t.Fatalf("unexpected accepted symbol %q", symbol)
		}
	}
	if report.Rejected["AAPLUSDT"] != "non_crypto_underlying" {
		t.Fatalf("AAPL rejection = %q", report.Rejected["AAPLUSDT"])
	}
	if report.Rejected["USDCUSDT"] != "stablecoin_base" {
		t.Fatalf("USDC rejection = %q", report.Rejected["USDCUSDT"])
	}
}

package market

import (
	"strings"
	"testing"
	"time"
)

func TestCheckReportIncludesInstanceDiagnostics(t *testing.T) {
	report := CheckReport{
		Version:        "test",
		InstanceID:     "a1b2c3d4",
		StartedAt:      time.Date(2026, time.July, 27, 19, 45, 0, 0, time.UTC),
		LocalInstances: 1,
	}

	html := report.TelegramHTML()
	for _, want := range []string{
		"Экземпляр: <code>a1b2c3d4</code>",
		"Старт: 2026-07-27 19:45:00 UTC",
		"Локальных экземпляров: <b>1</b>",
	} {
		if !strings.Contains(html, want) {
			t.Errorf("TelegramHTML() missing %q:\n%s", want, html)
		}
	}
}

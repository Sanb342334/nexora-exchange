package market

import (
	"context"
	"fmt"
	"strings"
	"time"

	"bybit-scanner/internal/config"
	"bybit-scanner/internal/health"
)

type CheckReport struct {
	WSStatus       string
	EventsTotal    uint64
	EventsPerMin   uint64
	SymbolCount    int
	RESTOK         bool
	RESTError      string
	RESTPrice      float64
	GeoBlock       bool
	Uptime         time.Duration
	Reconnects     uint64
	SignalsTotal   uint64
	Version        string
}

func RunCheck(
	ctx context.Context,
	rest *RESTClient,
	cfg *config.Config,
	h *health.Tracker,
	symbolCount int,
) CheckReport {
	r := CheckReport{
		SymbolCount: symbolCount,
		Version:     BuildVersion,
	}
	if h != nil {
		r.Uptime, r.SignalsTotal, _, r.Reconnects, r.EventsTotal, r.EventsPerMin, _, _ = h.Stats()
		r.WSStatus = h.WSStatus()
	}

	price, err := rest.FetchLastPrice(ctx, "BTCUSDT")
	if err != nil {
		r.RESTError = err.Error()
		r.GeoBlock = IsGeoBlock(err)
	} else {
		r.RESTOK = true
		r.RESTPrice = price
	}

	return r
}

func (r CheckReport) TelegramHTML() string {
	var b strings.Builder
	b.WriteString("🔍 <b>Диагностика сканера</b>\n\n")

	b.WriteString(fmt.Sprintf("📦 Версия: <code>%s</code>\n", r.Version))
	b.WriteString(fmt.Sprintf("⏱ Uptime: %s\n", r.Uptime.Truncate(time.Second)))
	b.WriteString(fmt.Sprintf("🪙 Монет в списке: <b>%d</b>\n\n", r.SymbolCount))

	b.WriteString("<b>WebSocket</b>\n")
	b.WriteString(r.WSStatus + "\n")
	b.WriteString(fmt.Sprintf("📨 Событий всего: %d\n", r.EventsTotal))
	b.WriteString(fmt.Sprintf("📨 Событий/мин: <b>%d</b>\n", r.EventsPerMin))
	b.WriteString(fmt.Sprintf("🔄 WS reconnects: %d\n\n", r.Reconnects))

	b.WriteString("<b>Bybit REST (BTC)</b>\n")
	if r.RESTOK {
		b.WriteString(fmt.Sprintf("🟢 OK — BTC $%.2f\n", r.RESTPrice))
	} else if r.GeoBlock {
		b.WriteString("🟡 Geo-block (норма на Railway) — WS работает\n")
	} else {
		short := r.RESTError
		if len(short) > 120 {
			short = short[:120] + "..."
		}
		b.WriteString(fmt.Sprintf("🔴 %s\n", short))
	}

	b.WriteString(fmt.Sprintf("\n🚨 Сигналов всего: %d\n\n", r.SignalsTotal))

	if r.EventsPerMin > 10 {
		b.WriteString("✅ <b>Вердикт: работает</b> — поток данных идёт\n")
	} else if r.EventsPerMin > 0 {
		b.WriteString("🟡 <b>Вердикт: частично</b> — мало событий, подожди 1–2 мин\n")
	} else if strings.Contains(r.WSStatus, "Ожидание") {
		b.WriteString("⏳ <b>Вердикт: старт</b> — подожди 30 сек и повтори /check\n")
	} else {
		b.WriteString("🔴 <b>Вердикт: проблема WS</b> — нет данных с Bybit\n")
	}

	return b.String()
}

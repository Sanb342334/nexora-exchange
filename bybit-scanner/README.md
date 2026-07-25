# Bybit Pump/Dump Scanner v2

Professional-grade CLI scanner for Bybit USDT linear futures with signal scoring, multi-source analysis, Telegram alerts with inline buttons, paper trading journal, and health monitoring.

## Features

### Detection
- **Signal Score 0–100** — weighted composite (volume, OI, price, orderflow, BTC decouple)
- **Min score filter** (default 70) — reduces noise
- **Per-symbol thresholds** — BTC/ETH have lower vol thresholds in `config.yaml`
- **BTC correlation filter** — skips alts that merely follow BTC
- **Spread filter** — skips illiquid pairs (wide bid/ask)

### Data Sources
| Source | Stream / Poll |
|--------|---------------|
| 1m Klines | WebSocket `kline.1` |
| Tickers (price, funding, OI, bid/ask) | WebSocket `tickers` |
| Public trades (orderflow delta) | WebSocket `publicTrade` |
| Liquidations | WebSocket `allLiquidation` |
| Open Interest | REST poll 10s + WS ticker |
| Long/Short ratio | REST poll 60s |

### Telegram Bot (multi-user)
- **Broadcast** — сигналы всем, кто нажал `/start`
- Подписчики сохраняются в `logs/subscribers.json`
- **Кнопки меню:**
  - 📋 **Логи** — последние записи signals/scanner/errors
  - 🧪 **Тестовый сигнал** — пример алерта
  - 📊 **Статус** — uptime, метрики, число подписчиков
  - 🏆 **Топ сигналов** — последние 5
  - 🔕 **Отписаться**
- Inline-кнопки на алертах: **Bybit** + **TradingView**
- Hourly digest
- Commands: `/start`, `/stop`, `/stats`, `/top`, `/logs`, `/test`, `/help`

### Other
- Paper trading journal → `logs/paper_trades.jsonl`
- Health monitor — alerts if no WS data for 2+ minutes
- Config hot-reload every 5 min (`config.yaml`)
- Production mode: `DRY_RUN=false`

## Quick Start

```powershell
cd bybit-scanner
Copy-Item .env.example .env
# Заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env

go mod tidy
go build -o bin/scanner.exe ./cmd/scanner
.\bin\scanner.exe
```

## Configuration

### `.env`
| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | — | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | — | Optional: auto-subscribe admin on start |
| `DRY_RUN` | `false` | `true` = logs only, no Telegram |
| `MIN_VOLUME_24H` | `10000000` | Min 24h USDT turnover |
| `ALERT_COOLDOWN_MIN` | `10` | Cooldown per symbol/trigger |
| `CONFIG_PATH` | `config.yaml` | Thresholds & scoring |

### `config.yaml`
```yaml
thresholds:
  min_score: 70          # Minimum score to fire alert
  volume_spike_ratio: 4.0
  oi_jump_pct: 2.5
  price_vol_pct: 3.0
  max_spread_pct: 0.15
  btc_correlation_pct: 1.0

symbols:
  BTCUSDT:
    price_vol_pct: 1.5   # Override for specific coins

blacklist: []
whitelist: []            # Empty = all symbols

paper:
  enabled: true          # Log virtual trades

digest:
  enabled: true
  interval_min: 60       # Hourly digest
```

## Telegram Alert Example

```
🚀 SOLUSDT | SCORE 82/100
━━━━━━━━━━━━━━━━━━━━
📈 Движение: PUMP
🧠 Сетап: SHORT_SQUEEZE
⏱ Latency: 1.45 ms

📊 Vol 1m: $1200000 (x5.20)
🔥 OI 3m: +3.10%
💵 Цена: $142.5 (+4.20% 1m)
⚡ Funding: 0.0100%
⚖️ L/S Ratio: 1.35
📶 Orderflow Δ: $85000
💥 Liquidations 1m: $12000
🔗 BTC decouple: да ✓ (BTC 5m: +0.30%)

🎯 Entry: $142.5
🛑 SL (ATR): $139.8
✅ TP (ATR): $147.2
```

## Bot Commands

| Command / Button | Description |
|------------------|-------------|
| `/start` | Подписаться на сигналы |
| `/stop` | Отписаться |
| 📋 Логи | Последние записи логов |
| 🧪 Тестовый сигнал | Пример алерта |
| 📊 Статус | Uptime, метрики |
| 🏆 Топ сигналов | Последние 5 |
| `/help` | Справка |

## Logs

| File | Content |
|------|---------|
| `logs/scanner.log` | All events |
| `logs/signals.log` | Fired signals with metrics |
| `logs/errors.log` | WS errors, reconnects |
| `logs/paper_trades.jsonl` | Virtual trades for testing |

## Testing Workflow

1. Start with `DRY_RUN=true` for 1–2 days — check signal quality in logs
2. Review `logs/paper_trades.jsonl` — track hypothetical entries
3. Tune `min_score` and thresholds in `config.yaml`
4. Set `DRY_RUN=false` — enable live Telegram alerts
5. Use `/stats` and `/top` to monitor bot health

## Architecture

```
Bybit REST ──► symbol universe
            ──► OI poller (10s)
            ──► L/S ratio poller (60s)

Bybit WS  ──► kline + tickers + trades + liquidations
           ──► analyzer (score + filters)
           ──► notifier ──► Telegram
           ──► paper journal
           ──► health monitor
```

## Deploy on Railway

Сканер — **worker-сервис** (без HTTP-порта). Railway держит процесс постоянно запущенным.

### 1. Создай проект

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Выбери репозиторий: `test2123123-nexora-p2p-exchange-platform`
3. **Settings → Root Directory** → `bybit-scanner`
4. Railway подхватит `Dockerfile` и `railway.toml` автоматически

### 2. Variables (Settings → Variables)

| Variable | Value |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | токен от @BotFather |
| `DRY_RUN` | `false` |
| `MIN_VOLUME_24H` | `10000000` |
| `ALERT_COOLDOWN_MIN` | `10` |
| `LOG_DIR` | `/app/logs` |
| `CONFIG_PATH` | `/app/config.yaml` |

`TELEGRAM_CHAT_ID` — опционально (auto-subscribe админа).

### 3. Volume (важно для подписчиков)

**Settings → Volumes → Add Volume**

- Mount path: `/app/logs`

Без volume список подписчиков (`subscribers.json`) сбросится при каждом redeploy.

### 4. Deploy

Push в `main` → Railway автоматически пересобирает.  
Или **Deploy → Redeploy** вручную.

### 5. Проверка

1. **Deployments → View Logs** — должно быть `bybit pump/dump scanner started`
2. Telegram → `/start` → **🧪 Тестовый сигнал**

### Railway CLI (опционально)

```bash
npm i -g @railway/cli
railway login
railway link
cd bybit-scanner
railway up
railway variables set TELEGRAM_BOT_TOKEN=xxx DRY_RUN=false
```

## License

MIT

# Railway deploy — ALdamat scanner

Railway marks the service **online** when the container stays running. That does **not** mean Telegram or Demo trading are configured.

## Critical: CONFIG_PATH

**Never set `CONFIG_PATH=config.local.yaml` on Railway.** That file exists only on your PC (gitignored) and is **not** in the Docker image. The panic you saw:

```
panic: read config config.local.yaml: open config.local.yaml: no such file or directory
```

**Fix:** In Railway → Variables, either **delete** `CONFIG_PATH` or set:

```env
CONFIG_PATH=/app/config.railway.yaml
```

After redeploy the bot should start. The image ships `config.railway.yaml` (Миша, Катя, Олег, demo).

## Required variables (Railway → Service → Variables)

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id_optional

TRADING_MODE=demo
AUTO_TRADE_DEMO=true

BYBIT_DEMO_API_KEY=your_demo_key
BYBIT_DEMO_API_SECRET=your_demo_secret
BYBIT_DEMO_REST_URL=https://api-demo.bybit.com

USE_DEFAULT_SYMBOLS=true
SYMBOLS_FILE=/app/symbols.list
CONFIG_PATH=/app/config.railway.yaml
LOG_DIR=/app/logs

DRY_RUN=false
RISK_KILL_SWITCH=false
DEMO_EQUITY_USDT=10000
```

## After deploy

1. Send **`/start`** to the bot again — subscribers are stored on disk; on Railway the disk is empty on first deploy unless you add a **Volume** mounted at `/app/logs`.
2. Send **`/check`** — diagnostics (WS, symbols, demo API).
3. Send **`/panel`** — terminal; mode should show **BYBIT DEMO** if `AUTO_TRADE_DEMO=true`.

## Common “online but dead” causes

| Symptom | Cause |
|--------|--------|
| No Telegram replies | Missing `TELEGRAM_BOT_TOKEN`, or second instance (local PC) still polling the same token |
| `/check` OK, no trades | `AUTO_TRADE_DEMO=false` or missing Demo API keys |
| Crashes on restart | Stale `scanner.lock` on persistent volume — delete `/app/logs/scanner.lock` or redeploy without volume |
| No symbols | Geo-block on Bybit REST — keep `USE_DEFAULT_SYMBOLS=true` + `symbols.list` (default in Docker) |

## One bot = one poller

Never run **local scanner** and **Railway** with the same `TELEGRAM_BOT_TOKEN` at the same time.

## Repo

Deploy from **https://github.com/Shaark22/ALdamat** (root = scanner, not p2p-exchange monorepo).

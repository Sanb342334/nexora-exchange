# Safe staged rollout

This runbook validates the quality-ledger work without allowing quality,
regime, orderbook, or replay results to change directional execution. Moving
between stages is a manual operational decision; no metric, config reload, or
shadow result promotes a strategy automatically.

## Non-negotiable safety settings

Keep these defaults in `.env` for shadow, replay, and paper:

```dotenv
TRADING_MODE=demo
LIVE_TRADING_ENABLED=false
AUTO_TRADE_DEMO=false
RISK_KILL_SWITCH=false
BYBIT_DEMO_REST_URL=https://api-demo.bybit.com
```

Keep `market_context.orderbook.enabled: false` unless each listed symbol has
been independently verified as Tier A. Enabling orderbook collection remains
observational; it does not authorize an order. Never point
`BYBIT_DEMO_REST_URL` at a live API host.

If account drift, an orphaned position, stale data, failed reconciliation, or
an unexpected execution event is observed, set `RISK_KILL_SWITCH=true`, keep
`AUTO_TRADE_DEMO=false`, preserve logs/SQLite evidence, and reconcile with
Bybit before resuming any automation.

## 1. Shadow

1. Run scanner with `AUTO_TRADE_DEMO=false`.
2. Verify `logs/signals.db` has immutable candidates, decisions, and
   source-timestamped 1m/5m/15m/1h outcomes.
3. Verify quality assessments are recorded with `Mode=SHADOW`; missing or
   stale features must be `UNAVAILABLE`/`STALE`, never positive factors.
4. Compare legacy and shadow outcomes with the replay/report tooling. Do not
   change score thresholds, sizing, stops, spreads, or risk limits from this
   comparison.

Advance only after the configured promotion report shows positive after-cost
out-of-sample expectancy, acceptable drawdown, enough independent aggregate
orders, zero unresolved outcomes/data-quality issues, and a human records the
policy version being evaluated.

## 2. Paper

1. Keep `AUTO_TRADE_DEMO=false`; use the paper journal and fixed cost model.
2. Replay the same fixtures and compare event-time outcomes with shadow
   records. Candles-only inputs do not validate book/order-flow fills.
3. Check restart recovery, account reservation caps, close-PnL deduplication,
   and no unresolved reconciliation drift.

Paper results remain research evidence. They cannot turn on Demo, Live, or
directional use of shadow factors.

## 3. Limited Demo

Limited Demo requires a manual change by an authorized operator after the
Shadow and Paper gates pass:

```dotenv
TRADING_MODE=demo
LIVE_TRADING_ENABLED=false
AUTO_TRADE_DEMO=true
DEMO_TEST_NOTIONAL_USDT=100
DEMO_TEST_SYMBOL=BTCUSDT
```

Before enabling, confirm Demo API keys target `api-demo.bybit.com`, global
account caps are below the available Demo equity, no existing unprotected
position exists, and the execution/reconciliation journals are writable.
Start with one Tier A symbol and the configured small notional; inspect the
authoritative Bybit position, SL/TP, and realised close-PnL reconciliation
after every order. Disable `AUTO_TRADE_DEMO` immediately on any mismatch.

Live execution is out of scope for this runbook. `LIVE_TRADING_ENABLED` stays
false, and no quality/promotion result changes it.

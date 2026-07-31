from pathlib import Path

cats = [
    (
        "markets",
        "Markets",
        "Рынки и торговля",
        [
            ("spot-markets", "Spot Markets", "Спотовые рынки", "table"),
            ("spot-trade", "Spot Trade", "Спотовая торговля", "trade"),
            ("futures-usd", "USD-M Futures", "Фьючерсы USDT", "trade"),
            ("futures-coin", "Coin-M Futures", "Фьючерсы Coin-M", "trade"),
            ("perpetual", "Perpetual Swaps", "Бессрочные контракты", "trade"),
            ("options", "Options", "Опционы", "trade"),
            ("options-chain", "Options Chain", "Цепочка опционов", "table"),
            ("margin-cross", "Cross Margin", "Кросс-маржа", "trade"),
            ("margin-isolated", "Isolated Margin", "Изолированная маржа", "trade"),
            ("convert", "Convert", "Конвертация", "form"),
            ("block-trade", "Block Trade", "Блок-сделки", "form"),
            ("otc-desk", "OTC Desk", "OTC-деск", "form"),
            ("p2p-market", "P2P Market", "P2P маркет", "link:/market"),
            ("p2p-express", "P2P Express", "P2P экспресс", "form"),
            ("grid-spot", "Spot Grid", "Спотовый грид", "bot"),
            ("grid-futures", "Futures Grid", "Фьючерсный грид", "bot"),
            ("dca-bot", "DCA Bot", "DCA-бот", "bot"),
            ("twap", "TWAP Orders", "TWAP-ордера", "form"),
            ("vwap", "VWAP Orders", "VWAP-ордера", "form"),
            ("iceberg", "Iceberg Orders", "Айсберг-ордера", "form"),
            ("trailing-stop", "Trailing Stop", "Трейлинг-стоп", "form"),
            ("oco", "OCO Orders", "OCO-ордера", "form"),
            ("scaled-orders", "Scaled Orders", "Лесенка ордеров", "form"),
            ("copy-trading", "Copy Trading", "Копитрейдинг", "table"),
            ("signal-trading", "Signal Trading", "Сигнальная торговля", "table"),
            ("strategy-marketplace", "Strategy Marketplace", "Маркетплейс стратегий", "table"),
            ("leaderboard", "Trader Leaderboard", "Рейтинг трейдеров", "table"),
            ("heatmaps", "Market Heatmap", "Тепловая карта", "dashboard"),
            ("screener", "Market Screener", "Скринер рынков", "table"),
            ("new-listings", "New Listings", "Новые листинги", "table"),
            ("delistings", "Delistings", "Делистинги", "table"),
            ("pair-info", "Pair Info", "Информация о паре", "dashboard"),
            ("orderbook-depth", "Order Book Depth", "Глубина стакана", "dashboard"),
            ("recent-trades", "Recent Trades", "Лента сделок", "table"),
            ("funding-rates", "Funding Rates", "Ставки фандинга", "table"),
            ("open-interest", "Open Interest", "Открытый интерес", "dashboard"),
            ("liquidations", "Liquidations", "Ликвидации", "table"),
            ("basis", "Basis Monitor", "Монитор базиса", "dashboard"),
        ],
    ),
    (
        "orders",
        "Orders",
        "Ордера и история",
        [
            ("open-orders", "Open Orders", "Открытые ордера", "table"),
            ("order-history", "Order History", "История ордеров", "table"),
            ("trade-history", "Trade History", "История сделок", "table"),
            ("position-history", "Position History", "История позиций", "table"),
            ("funding-history", "Funding History", "История фандинга", "table"),
            ("liquidation-history", "Liquidation History", "История ликвидаций", "table"),
            ("transaction-history", "Transaction History", "История транзакций", "table"),
            ("deposit-history", "Deposit History", "История депозитов", "table"),
            ("withdraw-history", "Withdraw History", "История выводов", "table"),
            ("transfer-history", "Transfer History", "История переводов", "table"),
            ("p2p-orders", "P2P Orders", "P2P ордера", "link:/deals"),
            ("p2p-ads", "My Ads", "Мои объявления", "link:/ads"),
            ("conditional-orders", "Conditional Orders", "Условные ордера", "table"),
            ("algo-orders", "Algo Orders", "Алго-ордера", "table"),
            ("bot-orders", "Bot Orders", "Ордера ботов", "table"),
            ("fill-reports", "Fill Reports", "Отчёты исполнений", "table"),
            ("export-csv", "Export CSV", "Экспорт CSV", "form"),
            ("tax-lots", "Tax Lots", "Налоговые лоты", "table"),
        ],
    ),
    (
        "wallet",
        "Wallet",
        "Кошелёк и финансы",
        [
            ("overview", "Asset Overview", "Обзор активов", "link:/wallet"),
            ("spot-wallet", "Spot Wallet", "Спотовый кошелёк", "dashboard"),
            ("futures-wallet", "Futures Wallet", "Фьючерсный кошелёк", "dashboard"),
            ("funding-wallet", "Funding Wallet", "Фандинг-кошелёк", "dashboard"),
            ("earn-wallet", "Earn Wallet", "Earn-кошелёк", "dashboard"),
            ("deposit", "Deposit", "Депозит", "form"),
            ("withdraw", "Withdraw", "Вывод", "form"),
            ("internal-transfer", "Internal Transfer", "Внутренний перевод", "form"),
            ("payment-methods", "Payment Methods", "Способы оплаты", "link:/payment-methods"),
            ("fiat-gateway", "Fiat Gateway", "Фиатный шлюз", "form"),
            ("crypto-address-book", "Address Book", "Адресная книга", "table"),
            ("whitelist", "Withdraw Whitelist", "Белый список выводов", "table"),
            ("travel-rule", "Travel Rule", "Travel Rule", "form"),
            ("statement", "Account Statement", "Выписка", "form"),
            ("balances-by-asset", "Balances by Asset", "Балансы по активам", "table"),
            ("pnl-overview", "PnL Overview", "Обзор PnL", "dashboard"),
            ("unrealized-pnl", "Unrealized PnL", "Нереализованный PnL", "dashboard"),
            ("asset-allocation", "Asset Allocation", "Распределение активов", "dashboard"),
            ("dust-convert", "Dust Convert", "Конвертация пыли", "form"),
            ("auto-invest-wallet", "Auto-Invest Wallet", "Кошелёк автоинвеста", "dashboard"),
        ],
    ),
    (
        "earn",
        "Earn",
        "Earn и продукты",
        [
            ("simple-earn", "Simple Earn", "Simple Earn", "table"),
            ("flexible-savings", "Flexible Savings", "Гибкие накопления", "table"),
            ("locked-savings", "Locked Savings", "Срочные накопления", "table"),
            ("staking", "Staking", "Стейкинг", "table"),
            ("liquid-staking", "Liquid Staking", "Ликвидный стейкинг", "table"),
            ("dual-investment", "Dual Investment", "Dual Investment", "form"),
            ("structured-products", "Structured Products", "Структурные продукты", "table"),
            ("launchpool", "Launchpool", "Launchpool", "table"),
            ("launchpad", "Launchpad", "Launchpad", "table"),
            ("megadrop", "MegaDrop", "MegaDrop", "table"),
            ("airdrops", "Airdrops Hub", "Хаб аирдропов", "table"),
            ("vip-loan", "VIP Loan", "VIP-займы", "form"),
            ("crypto-loan", "Crypto Loan", "Криптозаймы", "form"),
            ("auto-invest", "Auto Invest", "Автоинвест", "bot"),
            ("eth-staking", "ETH Staking", "ETH стейкинг", "form"),
            ("sol-staking", "SOL Staking", "SOL стейкинг", "form"),
            ("rewards-center", "Rewards Center", "Центр наград", "dashboard"),
            ("cashback", "Fee Cashback", "Кэшбек комиссий", "dashboard"),
            ("referral-earn", "Referral Earn", "Реферальный доход", "dashboard"),
            ("coupon-center", "Coupon Center", "Купоны", "table"),
            ("voucher", "Vouchers", "Ваучеры", "table"),
            ("task-center", "Task Center", "Центр заданий", "table"),
        ],
    ),
    (
        "tools",
        "Tools",
        "Инструменты и аналитика",
        [
            ("pnl-calculator", "PnL Calculator", "Калькулятор PnL", "calc"),
            ("liquidation-calculator", "Liquidation Calculator", "Калькулятор ликвидации", "calc"),
            ("funding-calculator", "Funding Calculator", "Калькулятор фандинга", "calc"),
            ("apr-apy", "APR/APY Converter", "APR/APY конвертер", "calc"),
            ("position-size", "Position Size", "Размер позиции", "calc"),
            ("risk-reward", "Risk/Reward", "Risk/Reward", "calc"),
            ("breakeven", "Breakeven Calculator", "Безубыток", "calc"),
            ("fee-calculator", "Fee Calculator", "Калькулятор комиссий", "calc"),
            ("price-alerts", "Price Alerts", "Ценовые алерты", "form"),
            ("funding-alerts", "Funding Alerts", "Алерты фандинга", "form"),
            ("watchlist", "Watchlist", "Список наблюдения", "table"),
            ("multi-chart", "Multi Chart", "Мульти-чарт", "dashboard"),
            ("tradingview-layout", "Chart Layouts", "Макеты графиков", "dashboard"),
            ("technical-indicators", "Indicators Library", "Библиотека индикаторов", "table"),
            ("economic-calendar", "Economic Calendar", "Экономический календарь", "table"),
            ("news-feed", "News Feed", "Лента новостей", "table"),
            ("sentiment", "Market Sentiment", "Сентимент рынка", "dashboard"),
            ("correlation", "Correlation Matrix", "Матрица корреляций", "dashboard"),
            ("volatility", "Volatility Lab", "Лаборатория волатильности", "dashboard"),
            ("portfolio-analyzer", "Portfolio Analyzer", "Анализ портфеля", "dashboard"),
            ("tax-report", "Tax Report", "Налоговый отчёт", "form"),
            ("api-playground", "API Playground", "API песочница", "form"),
            ("webhook-builder", "Webhook Builder", "Конструктор вебхуков", "form"),
            ("backtester", "Strategy Backtester", "Бэктестер", "form"),
            ("paper-trading", "Paper Trading", "Бумажная торговля", "trade"),
            ("demo-funds", "Demo Funds", "Демо-средства", "form"),
            ("risk-dashboard", "Risk Dashboard", "Риск-дашборд", "dashboard"),
            ("exposure", "Exposure Monitor", "Монитор экспозиции", "dashboard"),
            ("stress-test", "Stress Test", "Стресс-тест", "form"),
            ("scenario-planner", "Scenario Planner", "Сценарный планировщик", "form"),
        ],
    ),
    (
        "account",
        "Account",
        "Аккаунт и безопасность",
        [
            ("profile", "Profile", "Профиль", "form"),
            ("kyc", "Identity Verification", "Верификация KYC", "form"),
            ("security", "Security Center", "Центр безопасности", "dashboard"),
            ("2fa", "Two-Factor Auth", "Двухфакторная аутентификация", "form"),
            ("passkeys", "Passkeys", "Passkeys", "form"),
            ("anti-phishing", "Anti-Phishing Code", "Антифишинг-код", "form"),
            ("device-management", "Devices", "Устройства", "table"),
            ("login-history", "Login History", "История входов", "table"),
            ("api-keys", "API Keys", "API-ключи", "table"),
            ("api-permissions", "API Permissions", "Права API", "form"),
            ("sub-accounts", "Sub-Accounts", "Субаккаунты", "table"),
            ("preferences", "Preferences", "Настройки", "form"),
            ("language-region", "Language & Region", "Язык и регион", "form"),
            ("notifications-settings", "Notification Settings", "Настройки уведомлений", "form"),
            ("privacy", "Privacy Controls", "Конфиденциальность", "form"),
            ("sessions", "Active Sessions", "Активные сессии", "table"),
            ("freeze-account", "Freeze Account", "Заморозка аккаунта", "form"),
            ("close-account", "Close Account", "Закрытие аккаунта", "form"),
            ("vip-levels", "VIP Levels", "VIP-уровни", "dashboard"),
            ("fee-tier", "Fee Tier", "Тариф комиссий", "dashboard"),
            ("referral", "Referral Program", "Реферальная программа", "dashboard"),
            ("affiliate", "Affiliate", "Партнёрка", "dashboard"),
            ("messages", "Messages", "Сообщения", "link:/messages"),
            ("favorites", "Favorites", "Избранное", "link:/favorites"),
            ("support", "Support", "Поддержка", "link:/support"),
            ("tickets", "Support Tickets", "Тикеты поддержки", "table"),
            ("announcements", "Announcements", "Объявления", "table"),
            ("help-center", "Help Center", "Центр помощи", "table"),
            ("fees", "Fee Schedule", "Таблица комиссий", "table"),
            ("limits", "Trading Limits", "Лимиты торговли", "dashboard"),
            ("compliance", "Compliance Center", "Комплаенс", "dashboard"),
        ],
    ),
    (
        "institutional",
        "Institutional",
        "Институциональные",
        [
            ("prime-brokerage", "Prime Brokerage", "Прайм-брокеридж", "dashboard"),
            ("custody", "Custody", "Кастоди", "dashboard"),
            ("settlement", "Settlement", "Сеттлмент", "table"),
            ("rfq", "RFQ Desk", "RFQ-деск", "form"),
            ("liquidity-programs", "Liquidity Programs", "Программы ликвидности", "table"),
            ("market-maker", "Market Maker Portal", "Портал маркет-мейкера", "dashboard"),
            ("fund-admin", "Fund Admin", "Админ фонда", "dashboard"),
            ("audit-export", "Audit Export", "Аудит-экспорт", "form"),
            ("sla-status", "SLA Status", "SLA статус", "dashboard"),
            ("white-label", "White Label", "White Label", "dashboard"),
        ],
    ),
]

assets = [
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "TON", "AVAX", "DOT",
    "LINK", "MATIC", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "PEPE", "WIF",
    "TRX", "LTC", "BCH", "UNI", "AAVE", "MKR", "CRV", "INJ", "FIL", "ICP",
    "HBAR", "VET", "ALGO", "XLM", "EOS", "FTM", "SAND", "MANA", "AXS", "GALA",
    "IMX", "RNDR", "FET", "GRT", "SNX", "COMP", "YFI", "LDO", "STX", "TIA",
    "SEI", "JUP", "PYTH", "WLD", "ORDI", "BONK", "FLOKI", "SHIB", "NOT", "ENA",
    "PENDLE", "JTO", "STRK", "ZK", "TAO", "CAKE", "RUNE", "THETA", "FLOW", "KAVA",
    "NEO", "ETC", "DASH", "ZEC", "IOTA", "QTUM", "ZIL", "WAVES", "CHZ", "ENJ",
    "BAT", "ZRX", "ANKR", "CELO", "ONE", "ROSE", "KSM", "GLMR", "MOVR", "MINA",
    "CFX", "KLAY", "GMT", "APE", "LRC", "SKL", "STORJ", "ANKR2", "BLUR", "MASK",
]
cats.append(
    (
        "assets",
        "Assets",
        "Хабы активов",
        [(f"asset-{a.lower()}", f"{a} Hub", f"Хаб {a}", "dashboard") for a in assets],
    )
)

admin = [
    ("ops-dashboard", "Ops Dashboard", "Операционный дашборд", "dashboard"),
    ("user-risk", "User Risk Scores", "Риск-скоры пользователей", "table"),
    ("aml-queue", "AML Queue", "AML очередь", "table"),
    ("kyc-queue", "KYC Queue", "KYC очередь", "table"),
    ("dispute-board", "Dispute Board", "Доска споров", "table"),
    ("fee-revenue", "Fee Revenue", "Доход с комиссий", "dashboard"),
    ("spread-analytics", "Spread Analytics", "Аналитика спреда", "dashboard"),
    ("house-balances", "House Balances", "Балансы дома", "dashboard"),
    ("employee-balances", "Employee Balances", "Балансы сотрудников", "table"),
    ("audit-trail", "Audit Trail", "Аудит-лог", "table"),
    ("rate-overrides", "Rate Overrides", "Переопределение курсов", "form"),
    ("hedge-console", "Hedge Console", "Консоль хеджа", "link:/admin/hedge"),
    ("liquidity-monitor", "Liquidity Monitor", "Монитор ликвидности", "dashboard"),
    ("alert-rules", "Alert Rules", "Правила алертов", "form"),
    ("feature-flags", "Feature Flags", "Feature flags", "table"),
    ("maintenance-mode", "Maintenance Mode", "Режим обслуживания", "form"),
    ("announcement-editor", "Announcement Editor", "Редактор анонсов", "form"),
    ("support-inbox", "Support Inbox", "Инбокс поддержки", "table"),
    ("compliance-reports", "Compliance Reports", "Комплаенс-отчёты", "table"),
    ("settlement-batch", "Settlement Batch", "Батч сеттлмента", "form"),
    ("wallet-sweep", "Wallet Sweep", "Свип кошельков", "form"),
    ("cold-wallet", "Cold Wallet Ops", "Холодный кошелёк", "dashboard"),
    ("hot-wallet", "Hot Wallet Ops", "Горячий кошелёк", "dashboard"),
    ("reconciliation", "Reconciliation", "Сверка", "table"),
    ("incident-center", "Incident Center", "Инцидент-центр", "table"),
    ("settings-hub", "Platform Settings", "Настройки платформы", "form"),
    ("employee-roles", "Employee Roles", "Роли сотрудников", "table"),
    ("p2p-queue", "P2P Queue", "Очередь P2P", "link:/admin/queue"),
    ("rates-console", "Rates Console", "Консоль курсов", "link:/admin/rates"),
    ("treasury-console", "Treasury Console", "Казначейство", "link:/admin/treasury"),
]

lines = [
    "import type { ExchangeFeature, ExchangeCategory } from './exchange-types';",
    "",
    "export const EXCHANGE_CATEGORIES: ExchangeCategory[] = [",
]
total = 0
for cid, en, ru, items in cats:
    lines.append("  {")
    lines.append(f"    id: '{cid}',")
    lines.append(f"    titleEn: '{en}',")
    lines.append(f"    titleRu: '{ru}',")
    lines.append("    features: [")
    for slug, en_t, ru_t, kind in items:
        total += 1
        if kind.startswith("link:"):
            href = kind.split(":", 1)[1]
            lines.append(
                f"      {{ slug: '{slug}', titleEn: {en_t!r}, titleRu: {ru_t!r}, kind: 'link', href: '{href}' }},"
            )
        else:
            lines.append(
                f"      {{ slug: '{slug}', titleEn: {en_t!r}, titleRu: {ru_t!r}, kind: '{kind}' }},"
            )
    lines.append("    ],")
    lines.append("  },")
lines.append("];")
lines.append("")
lines.append("export const ADMIN_SUITE_FEATURES: ExchangeFeature[] = [")
for slug, en_t, ru_t, kind in admin:
    total += 1
    if kind.startswith("link:"):
        href = kind.split(":", 1)[1]
        lines.append(
            f"  {{ slug: '{slug}', titleEn: {en_t!r}, titleRu: {ru_t!r}, kind: 'link', href: '{href}' }},"
        )
    else:
        lines.append(
            f"  {{ slug: '{slug}', titleEn: {en_t!r}, titleRu: {ru_t!r}, kind: '{kind}' }},"
        )
lines.extend(
    [
        "];",
        "",
        "export function allFeatures(): ExchangeFeature[] {",
        "  return EXCHANGE_CATEGORIES.flatMap((c) => c.features);",
        "}",
        "",
        "export function findFeature(slug: string): ExchangeFeature | undefined {",
        "  return allFeatures().find((f) => f.slug === slug) ?? ADMIN_SUITE_FEATURES.find((f) => f.slug === slug);",
        "}",
        "",
        "export function findCategory(id: string): ExchangeCategory | undefined {",
        "  return EXCHANGE_CATEGORIES.find((c) => c.id === id);",
        "}",
        "",
        f"export const TOTAL_EXCHANGE_FEATURES = {total};",
        "",
    ]
)

out = Path(__file__).resolve().parents[1] / "src" / "lib" / "exchange-catalog.ts"
out.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {total} features -> {out}")

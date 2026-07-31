import type { LocaleId } from './locales';

export type NavMessages = {
  market: string;
  trade: string;
  deals: string;
  wallet: string;
  messages: string;
  support: string;
  ads: string;
  favorites: string;
  panel: string;
  account: string;
  verification: string;
  settings: string;
  logout: string;
  p2pMarket: string;
};

export type ShellMessages = {
  notifications: string;
  markAllRead: string;
  noNotifications: string;
  verified: string;
  language: string;
  inviteFriends: string;
  inviteDesc: string;
  inviteBtn: string;
  footerAbout: string;
  footerRules: string;
  footerSecurity: string;
  footerApi: string;
  footerSupport: string;
  mobileMarket: string;
  mobileDeals: string;
  mobileAds: string;
  mobileWallet: string;
  mobileChat: string;
};

export type MarketMessages = {
  buy: string;
  sell: string;
  activeAds: string;
  deals: string;
  volume: string;
  users: string;
  online: string;
  createAd: string;
  moreInfo: string;
  advertiser: string;
  price: string;
  available: string;
  paymentMethod: string;
  action: string;
  noAds: string;
  quickActions: string;
  rates: string;
  securityTitle: string;
  allPayments: string;
  filters: string;
  sortBy: string;
  sortPrice: string;
  sortRating: string;
  adsCount: string;
  showMore: string;
  buyUsdt: string;
  sellUsdt: string;
  addedToFav: string;
  removedFromFav: string;
  dealCreated: string;
  error: string;
  selectFiat: string;
};

export type HeroMessages = {
  badge: string;
  title: string;
  subtitle: string;
  line1: string;
  line2: string;
  line3: string;
  createAd: string;
  moreInfo: string;
};

export type DealsMessages = {
  title: string;
  subtitle: string;
  empty: string;
  counterparty: string;
  amount: string;
};

export type WalletMessages = {
  title: string;
  totalBalance: string;
  deposit: string;
  withdraw: string;
  frozen: string;
  history: string;
  hideBalance: string;
  showBalance: string;
};

export type RegisterMessages = {
  title: string;
  subtitle: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  country: string;
  currency: string;
  selectCountry: string;
  selectCurrency: string;
  createAccount: string;
  haveAccount: string;
  signIn: string;
  passwordHint: string;
  mismatch: string;
  success: string;
};

export type CommonMessages = {
  loading: string;
  expired: string;
  save: string;
  cancel: string;
  continue: string;
};

export type DealStatusMessages = {
  CREATED: string;
  PAID: string;
  RELEASED: string;
  COMPLETED: string;
  CANCELLED: string;
  EXPIRED: string;
  DISPUTED: string;
};

export type TradeHeroMessages = {
  badge: string;
  title: string;
  subtitle: string;
  line1: string;
  line2: string;
  ctaPrimary: string;
  ctaFutures: string;
};

export type TradeMessages = {
  hero: TradeHeroMessages;
  invalidPair: string;
  spot: string;
  futures: string;
  futuresSoon: string;
  p2pMarketLink: string;
  pair: string;
  lastPrice: string;
  change24h: string;
  trade: string;
  chartLink: string;
  orderBook: string;
  loadingOrderBook: string;
  price: string;
  buy: string;
  sell: string;
  limit: string;
  market: string;
  amount: string;
  priceIn: string;
  amountIn: string;
  submitBuy: string;
  submitSell: string;
  orderPlaced: string;
  orderFailed: string;
  fundWallet: string;
  validating: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  long: string;
  short: string;
  leverage: string;
  margin: string;
  liquidationPrice: string;
  openPosition: string;
  closePosition: string;
  positions: string;
  noPositions: string;
  positionOpened: string;
  positionClosed: string;
  marketsSpot: string;
  marketsFutures: string;
};

export type AppMessages = {
  nav: NavMessages;
  shell: ShellMessages;
  hero: HeroMessages;
  market: MarketMessages;
  trade: TradeMessages;
  deals: DealsMessages;
  wallet: WalletMessages;
  register: RegisterMessages;
  common: CommonMessages;
  dealStatus: DealStatusMessages;
};

/** Locale overrides may patch individual fields within each section. */
export type AppMessagesPatch = {
  nav?: Partial<NavMessages>;
  shell?: Partial<ShellMessages>;
  hero?: Partial<HeroMessages>;
  market?: Partial<MarketMessages>;
  trade?: Partial<TradeMessages> & { hero?: Partial<TradeHeroMessages> };
  deals?: Partial<DealsMessages>;
  wallet?: Partial<WalletMessages>;
  register?: Partial<RegisterMessages>;
  common?: Partial<CommonMessages>;
  dealStatus?: Partial<DealStatusMessages>;
};

export const APP_EN: AppMessages = {
  nav: {
    market: 'P2P Trading',
    trade: 'Markets',
    deals: 'My deals',
    wallet: 'Wallet',
    messages: 'Messages',
    support: 'Support',
    ads: 'My ads',
    favorites: 'Favorites',
    panel: 'Panel',
    account: 'Account',
    verification: 'Verification',
    settings: 'Settings',
    logout: 'Log out',
    p2pMarket: 'P2P Market',
  },
  shell: {
    notifications: 'Notifications',
    markAllRead: 'Mark all read',
    noNotifications: 'No notifications',
    verified: 'Verified',
    language: 'Language',
    inviteFriends: 'Invite friends',
    inviteDesc: 'Earn up to 10% from each deal',
    inviteBtn: 'Invite',
    footerAbout: 'About us',
    footerRules: 'Rules',
    footerSecurity: 'Security',
    footerApi: 'API',
    footerSupport: 'Support',
    mobileMarket: 'Markets',
    mobileDeals: 'Deals',
    mobileAds: 'Ads',
    mobileWallet: 'Wallet',
    mobileChat: 'Chat',
  },
  hero: {
    badge: 'Spot · Futures · P2P',
    title: 'One platform, every strategy',
    subtitle: 'Buy and sell BTC, ETH, XRP and more. Trade spot and futures with professional charts.',
    line1: 'Automate recurring buys. Earn yield on your balance.',
    line2: 'Send anywhere in the world instantly, with low fees.',
    line3: 'Spend crypto at millions of merchants. Enterprise-grade security.',
    createAd: 'Start trading',
    moreInfo: 'Learn more',
  },
  market: {
    buy: 'Buy',
    sell: 'Sell',
    activeAds: 'Active ads',
    deals: 'Deals',
    volume: 'Volume',
    users: 'Users',
    online: 'Online',
    createAd: 'Create ad',
    moreInfo: 'More info',
    advertiser: 'Advertiser',
    price: 'Price',
    available: 'Available / Limits',
    paymentMethod: 'Payment method',
    action: 'Action',
    noAds: 'No ads found',
    quickActions: 'Quick actions',
    rates: 'Crypto rates',
    securityTitle: 'Security first',
    allPayments: 'All payment methods',
    filters: 'Filters',
    sortBy: 'Sort:',
    sortPrice: 'By price',
    sortRating: 'By rating',
    adsCount: '{count} ads',
    showMore: 'Show more ads',
    buyUsdt: 'Buy USDT',
    sellUsdt: 'Sell USDT',
    addedToFav: 'Added to favorites',
    removedFromFav: 'Removed from favorites',
    dealCreated: 'Deal created',
    error: 'Error',
    selectFiat: 'Select currency',
  },
  trade: {
    hero: {
      badge: 'Crypto · Futures · P2P',
      title: 'Trade crypto assets with up to 100× leverage',
      subtitle: 'BTC, ETH, XRP and more — fast entries, clear charts, one terminal.',
      line1: 'Leverage up to 100× on crypto pairs.',
      line2: 'Deposit, trade, and withdraw in your local currency.',
      ctaPrimary: 'Start trading',
      ctaFutures: 'Open futures',
    },
    invalidPair: 'Invalid trading pair',
    spot: 'Spot',
    futures: 'Futures',
    futuresSoon: 'Futures coming soon',
    p2pMarketLink: 'P2P Market →',
    pair: 'Pair',
    lastPrice: 'Last price',
    change24h: '24h',
    trade: 'Trade',
    chartLink: 'Chart →',
    orderBook: 'Order book',
    loadingOrderBook: 'Loading order book…',
    price: 'Price',
    buy: 'Buy',
    sell: 'Sell',
    limit: 'Limit',
    market: 'Market',
    amount: 'Amount',
    priceIn: 'Price ({quote})',
    amountIn: 'Amount ({base})',
    submitBuy: 'Buy {base}',
    submitSell: 'Sell {base}',
    orderPlaced: 'Order placed',
    orderFailed: 'Order failed',
    fundWallet: 'Fund your wallet to trade',
    validating: 'Placing order…',
    high24h: '24h High',
    low24h: '24h Low',
    vol24h: '24h Vol',
    long: 'Long',
    short: 'Short',
    leverage: 'Leverage',
    margin: 'Margin',
    liquidationPrice: 'Liq. price',
    openPosition: 'Open position',
    closePosition: 'Close',
    positions: 'Open positions',
    noPositions: 'No open positions',
    positionOpened: 'Position opened',
    positionClosed: 'Position closed',
    marketsSpot: 'Spot markets',
    marketsFutures: 'Futures markets',
  },
  deals: {
    title: 'My deals',
    subtitle: 'Active and completed P2P trades',
    empty: 'No deals yet',
    counterparty: 'Counterparty',
    amount: 'Amount',
  },
  wallet: {
    title: 'Wallet',
    totalBalance: 'Total balance',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    frozen: 'Frozen',
    history: 'History',
    hideBalance: 'Hide balance',
    showBalance: 'Show balance',
  },
  register: {
    title: 'Create NEXORA account',
    subtitle: 'Select your country and preferred fiat currency',
    username: 'Username',
    email: 'Email (optional)',
    password: 'Password',
    confirmPassword: 'Confirm password',
    country: 'Country',
    currency: 'Currency',
    selectCountry: 'Select country',
    selectCurrency: 'Select currency',
    createAccount: 'Create account',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
    passwordHint: 'At least 8 characters',
    mismatch: 'Passwords do not match',
    success: 'Account created',
  },
  common: {
    loading: 'Loading…',
    expired: 'expired',
    save: 'Save',
    cancel: 'Cancel',
    continue: 'Continue',
  },
  dealStatus: {
    CREATED: 'Awaiting payment',
    PAID: 'Awaiting release',
    RELEASED: 'Coins released',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
    DISPUTED: 'Dispute',
  },
};

function deepMergeApp(base: AppMessages, patch: AppMessagesPatch): AppMessages {
  return {
    nav: { ...base.nav, ...patch.nav },
    shell: { ...base.shell, ...patch.shell },
    hero: { ...base.hero, ...patch.hero },
    market: { ...base.market, ...patch.market },
    trade: { ...base.trade, ...patch.trade, hero: { ...base.trade.hero, ...patch.trade?.hero } },
    deals: { ...base.deals, ...patch.deals },
    wallet: { ...base.wallet, ...patch.wallet },
    register: { ...base.register, ...patch.register },
    common: { ...base.common, ...patch.common },
    dealStatus: { ...base.dealStatus, ...patch.dealStatus },
  };
}

/** Locale-specific app UI overrides (merged with English base). */
export const APP_TRANSLATIONS: Partial<Record<LocaleId, AppMessagesPatch>> = {
  ru: {
    nav: {
      market: 'P2P Торговля', trade: 'Рынки', deals: 'Мои сделки', wallet: 'Кошелёк', messages: 'Сообщения',
      support: 'Поддержка', ads: 'Мои объявления', favorites: 'Избранное', panel: 'Панель',
      account: 'Аккаунт', verification: 'Верификация', settings: 'Настройки', logout: 'Выйти', p2pMarket: 'P2P Маркет',
    },
    shell: {
      notifications: 'Уведомления', markAllRead: 'Прочитать все', noNotifications: 'Нет уведомлений',
      verified: 'Верифицирован', language: 'Язык', inviteFriends: 'Приглашай друзей',
      inviteDesc: 'Зарабатывай до 10% с каждой сделки', inviteBtn: 'Пригласить',
      footerAbout: 'О нас', footerRules: 'Правила', footerSecurity: 'Безопасность',
      footerApi: 'API', footerSupport: 'Поддержка', mobileMarket: 'Рынки', mobileDeals: 'Сделки',
      mobileAds: 'Объявл.', mobileWallet: 'Кошелёк', mobileChat: 'Чат',
    },
    hero: {
      badge: 'Спот · Фьючерсы · P2P',
      title: 'Одна платформа — любая стратегия',
      subtitle: 'Покупайте и продавайте BTC, ETH, XRP и другие активы. Спот и фьючерсы с профессиональными графиками.',
      line1: 'Автоматизируйте регулярные покупки. Получайте доход на балансе.',
      line2: 'Отправляйте средства по всему миру мгновенно и с низкими комиссиями.',
      line3: 'Тратьте криптовалюту у миллионов мерчантов. Безопасность корпоративного уровня.',
      createAd: 'Начать торговлю',
      moreInfo: 'Подробнее',
    },
    market: {
      buy: 'Купить', sell: 'Продать', activeAds: 'Активных объявлений', deals: 'Сделок',
      volume: 'Объём', users: 'Пользователей', online: 'Онлайн', createAd: 'Создать объявление',
      moreInfo: 'Подробнее', advertiser: 'Рекламодатель', price: 'Цена',
      available: 'Доступно / Лимиты', paymentMethod: 'Способ оплаты', action: 'Действие',
      noAds: 'Объявления не найдены', quickActions: 'Быстрые действия', rates: 'Курсы криптовалют',
      securityTitle: 'Безопасность на первом месте',
      allPayments: 'Все способы оплаты', filters: 'Фильтры', sortBy: 'Сортировка:', sortPrice: 'По цене',
      sortRating: 'По рейтингу', adsCount: '{count} объявлений', showMore: 'Показать ещё объявления',
      buyUsdt: 'Купить USDT', sellUsdt: 'Продать USDT', addedToFav: 'Добавлено в избранное',
      removedFromFav: 'Удалено из избранного', dealCreated: 'Сделка создана', error: 'Ошибка', selectFiat: 'Выберите валюту',
    },
    trade: {
      hero: {
        badge: 'Крипто · Фьючерсы · P2P',
        title: 'Торгуйте криптоактивами с плечом до 100×',
        subtitle: 'BTC, ETH, XRP и другие пары — быстрый вход, понятные графики, один терминал.',
        line1: 'Плечо до 100× на криптопарах.',
        line2: 'Пополнение, торговля и вывод в вашей валюте.',
        ctaPrimary: 'Начать торговлю',
        ctaFutures: 'Открыть фьючерсы',
      },
      invalidPair: 'Неверная торговая пара',
      spot: 'Спот', futures: 'Фьючерсы', futuresSoon: 'Фьючерсы скоро',
      p2pMarketLink: 'P2P Маркет →', pair: 'Пара', lastPrice: 'Цена', change24h: '24ч',
      trade: 'Торговля', chartLink: 'График →', orderBook: 'Стакан', loadingOrderBook: 'Загрузка стакана…',
      price: 'Цена', buy: 'Купить', sell: 'Продать', limit: 'Лимит', market: 'Рынок', amount: 'Кол-во',
      priceIn: 'Цена ({quote})', amountIn: 'Кол-во ({base})', submitBuy: 'Купить {base}', submitSell: 'Продать {base}',
      orderPlaced: 'Ордер размещён', orderFailed: 'Ошибка ордера', fundWallet: 'Пополните кошелёк для торговли',
      validating: 'Размещение…', high24h: 'Макс 24ч', low24h: 'Мин 24ч', vol24h: 'Объём 24ч',
      long: 'Лонг', short: 'Шорт', leverage: 'Плечо', margin: 'Маржа', liquidationPrice: 'Цена ликв.',
      openPosition: 'Открыть позицию', closePosition: 'Закрыть', positions: 'Открытые позиции',
      noPositions: 'Нет открытых позиций', positionOpened: 'Позиция открыта', positionClosed: 'Позиция закрыта',
      marketsSpot: 'Спот-рынки', marketsFutures: 'Фьючерсы',
    },
    deals: {
      title: 'Мои сделки', subtitle: 'Активные и завершённые P2P-сделки',
      empty: 'Сделок пока нет', counterparty: 'Контрагент', amount: 'Сумма',
    },
    wallet: {
      title: 'Кошелёк', totalBalance: 'Общий баланс', deposit: 'Пополнить', withdraw: 'Вывести',
      frozen: 'Заморожено', history: 'История', hideBalance: 'Скрыть баланс', showBalance: 'Показать баланс',
    },
    register: {
      title: 'Создать аккаунт NEXORA', subtitle: 'Выберите страну и предпочитаемую валюту',
      username: 'Имя пользователя', email: 'Email (необязательно)', password: 'Пароль',
      confirmPassword: 'Подтвердите пароль', country: 'Страна', currency: 'Валюта',
      selectCountry: 'Выберите страну', selectCurrency: 'Выберите валюту',
      createAccount: 'Создать аккаунт', haveAccount: 'Уже есть аккаунт?', signIn: 'Войти',
      passwordHint: 'Минимум 8 символов', mismatch: 'Пароли не совпадают', success: 'Аккаунт создан',
    },
    common: { loading: 'Загрузка…', expired: 'истекло', save: 'Сохранить', cancel: 'Отмена', continue: 'Продолжить' },
    dealStatus: {
      CREATED: 'Ожидается оплата', PAID: 'Ожидается перевод монет', RELEASED: 'Монеты переведены',
      COMPLETED: 'Завершено', CANCELLED: 'Отменена', EXPIRED: 'Истекла', DISPUTED: 'Апелляция',
    },
  },
  uk: {
    nav: {
      market: 'P2P Торгівля', deals: 'Мої угоди', wallet: 'Гаманець', messages: 'Повідомлення',
      support: 'Підтримка', ads: 'Мої оголошення', favorites: 'Обране', panel: 'Панель',
      account: 'Акаунт', verification: 'Верифікація', settings: 'Налаштування', logout: 'Вийти', p2pMarket: 'P2P Маркет',
    },
    register: {
      title: 'Створити акаунт NEXORA', subtitle: 'Оберіть країну та валюту',
      country: 'Країна', currency: 'Валюта', createAccount: 'Створити акаунт',
    },
  },
  de: {
    nav: { market: 'P2P Handel', deals: 'Meine Deals', wallet: 'Wallet', messages: 'Nachrichten', support: 'Support', ads: 'Meine Anzeigen', favorites: 'Favoriten', panel: 'Panel', account: 'Konto', verification: 'Verifizierung', settings: 'Einstellungen', logout: 'Abmelden', p2pMarket: 'P2P Markt' },
    register: { title: 'NEXORA-Konto erstellen', subtitle: 'Land und Währung wählen', country: 'Land', currency: 'Währung', createAccount: 'Konto erstellen' },
  },
  fr: {
    nav: { market: 'Trading P2P', deals: 'Mes transactions', wallet: 'Portefeuille', messages: 'Messages', support: 'Support', ads: 'Mes annonces', favorites: 'Favoris', panel: 'Panneau', account: 'Compte', verification: 'Vérification', settings: 'Paramètres', logout: 'Déconnexion', p2pMarket: 'Marché P2P' },
    register: { title: 'Créer un compte NEXORA', subtitle: 'Choisissez pays et devise', country: 'Pays', currency: 'Devise', createAccount: 'Créer un compte' },
  },
  es: {
    nav: { market: 'Trading P2P', deals: 'Mis operaciones', wallet: 'Cartera', messages: 'Mensajes', support: 'Soporte', ads: 'Mis anuncios', favorites: 'Favoritos', panel: 'Panel', account: 'Cuenta', verification: 'Verificación', settings: 'Ajustes', logout: 'Salir', p2pMarket: 'Mercado P2P' },
    register: { title: 'Crear cuenta NEXORA', subtitle: 'Seleccione país y moneda', country: 'País', currency: 'Moneda', createAccount: 'Crear cuenta' },
  },
  vi: {
    nav: { market: 'Giao dịch P2P', deals: 'Giao dịch của tôi', wallet: 'Ví', messages: 'Tin nhắn', support: 'Hỗ trợ', ads: 'Quảng cáo', favorites: 'Yêu thích', panel: 'Bảng', account: 'Tài khoản', verification: 'Xác minh', settings: 'Cài đặt', logout: 'Đăng xuất', p2pMarket: 'Chợ P2P' },
    register: { title: 'Tạo tài khoản NEXORA', subtitle: 'Chọn quốc gia và tiền tệ', country: 'Quốc gia', currency: 'Tiền tệ', createAccount: 'Tạo tài khoản' },
  },
  nl: {
    nav: { market: 'P2P Handel', deals: 'Mijn deals', wallet: 'Wallet', messages: 'Berichten', support: 'Support', ads: 'Mijn advertenties', favorites: 'Favorieten', panel: 'Paneel', account: 'Account', verification: 'Verificatie', settings: 'Instellingen', logout: 'Uitloggen', p2pMarket: 'P2P Markt' },
    register: { title: 'NEXORA-account aanmaken', subtitle: 'Kies land en valuta', country: 'Land', currency: 'Valuta', createAccount: 'Account aanmaken' },
  },
  pl: {
    nav: { market: 'Handel P2P', deals: 'Moje transakcje', wallet: 'Portfel', messages: 'Wiadomości', support: 'Wsparcie', ads: 'Moje ogłoszenia', favorites: 'Ulubione', panel: 'Panel', account: 'Konto', verification: 'Weryfikacja', settings: 'Ustawienia', logout: 'Wyloguj', p2pMarket: 'Rynek P2P' },
    register: { title: 'Utwórz konto NEXORA', subtitle: 'Wybierz kraj i walutę', country: 'Kraj', currency: 'Waluta', createAccount: 'Utwórz konto' },
  },
  tr: {
    nav: { market: 'P2P Ticaret', deals: 'İşlemlerim', wallet: 'Cüzdan', messages: 'Mesajlar', support: 'Destek', ads: 'İlanlarım', favorites: 'Favoriler', panel: 'Panel', account: 'Hesap', verification: 'Doğrulama', settings: 'Ayarlar', logout: 'Çıkış', p2pMarket: 'P2P Pazar' },
    register: { title: 'NEXORA hesabı oluştur', subtitle: 'Ülke ve para birimi seçin', country: 'Ülke', currency: 'Para birimi', createAccount: 'Hesap oluştur' },
  },
  'zh-CN': {
    nav: { market: 'P2P 交易', deals: '我的订单', wallet: '钱包', messages: '消息', support: '支持', ads: '我的广告', favorites: '收藏', panel: '面板', account: '账户', verification: '验证', settings: '设置', logout: '退出', p2pMarket: 'P2P 市场' },
    register: { title: '创建 NEXORA 账户', subtitle: '选择国家和货币', country: '国家', currency: '货币', createAccount: '创建账户' },
  },
  ko: {
    nav: { market: 'P2P 거래', deals: '내 거래', wallet: '지갑', messages: '메시지', support: '지원', ads: '내 광고', favorites: '즐겨찾기', panel: '패널', account: '계정', verification: '인증', settings: '설정', logout: '로그아웃', p2pMarket: 'P2P 마켓' },
    register: { title: 'NEXORA 계정 만들기', subtitle: '국가 및 통화 선택', country: '국가', currency: '통화', createAccount: '계정 만들기' },
  },
  it: {
    nav: { market: 'Trading P2P', deals: 'Le mie operazioni', wallet: 'Portafoglio', messages: 'Messaggi', support: 'Supporto', ads: 'I miei annunci', favorites: 'Preferiti', panel: 'Pannello', account: 'Account', verification: 'Verifica', settings: 'Impostazioni', logout: 'Esci', p2pMarket: 'Mercato P2P' },
    register: { title: 'Crea account NEXORA', subtitle: 'Seleziona paese e valuta', country: 'Paese', currency: 'Valuta', createAccount: 'Crea account' },
  },
  cs: {
    nav: { market: 'P2P obchod', deals: 'Moje obchody', wallet: 'Peněženka', messages: 'Zprávy', support: 'Podpora', ads: 'Moje inzeráty', favorites: 'Oblíbené', panel: 'Panel', account: 'Účet', verification: 'Ověření', settings: 'Nastavení', logout: 'Odhlásit', p2pMarket: 'P2P trh' },
  },
  da: {
    nav: { market: 'P2P handel', deals: 'Mine handler', wallet: 'Pung', messages: 'Beskeder', support: 'Support', ads: 'Mine annoncer', favorites: 'Favoritter', panel: 'Panel', account: 'Konto', verification: 'Verifikation', settings: 'Indstillinger', logout: 'Log ud', p2pMarket: 'P2P marked' },
  },
  no: {
    nav: { market: 'P2P-handel', deals: 'Mine handler', wallet: 'Lommebok', messages: 'Meldinger', support: 'Support', ads: 'Mine annonser', favorites: 'Favoritter', panel: 'Panel', account: 'Konto', verification: 'Verifisering', settings: 'Innstillinger', logout: 'Logg ut', p2pMarket: 'P2P-marked' },
  },
  sv: {
    nav: { market: 'P2P-handel', deals: 'Mina affärer', wallet: 'Plånbok', messages: 'Meddelanden', support: 'Support', ads: 'Mina annonser', favorites: 'Favoriter', panel: 'Panel', account: 'Konto', verification: 'Verifiering', settings: 'Inställningar', logout: 'Logga ut', p2pMarket: 'P2P-marknad' },
  },
  fi: {
    nav: { market: 'P2P-kauppa', deals: 'Kaupat', wallet: 'Lompakko', messages: 'Viestit', support: 'Tuki', ads: 'Ilmoitukset', favorites: 'Suosikit', panel: 'Paneeli', account: 'Tili', verification: 'Vahvistus', settings: 'Asetukset', logout: 'Kirjaudu ulos', p2pMarket: 'P2P-markkina' },
  },
  hu: {
    nav: { market: 'P2P kereskedés', deals: 'Ügyleteim', wallet: 'Pénztárca', messages: 'Üzenetek', support: 'Támogatás', ads: 'Hirdetéseim', favorites: 'Kedvencek', panel: 'Panel', account: 'Fiók', verification: 'Ellenőrzés', settings: 'Beállítások', logout: 'Kilépés', p2pMarket: 'P2P piac' },
  },
  ro: {
    nav: { market: 'Tranzacții P2P', deals: 'Tranzacțiile mele', wallet: 'Portofel', messages: 'Mesaje', support: 'Suport', ads: 'Anunțurile mele', favorites: 'Favorite', panel: 'Panou', account: 'Cont', verification: 'Verificare', settings: 'Setări', logout: 'Deconectare', p2pMarket: 'Piață P2P' },
  },
  el: {
    nav: { market: 'P2P συναλλαγές', deals: 'Οι συναλλαγές μου', wallet: 'Πορτοφόλι', messages: 'Μηνύματα', support: 'Υποστήριξη', ads: 'Οι αγγελίες μου', favorites: 'Αγαπημένα', panel: 'Πίνακας', account: 'Λογαριασμός', verification: 'Επαλήθευση', settings: 'Ρυθμίσεις', logout: 'Έξοδος', p2pMarket: 'P2P αγορά' },
  },
  ms: {
    nav: { market: 'Dagangan P2P', deals: 'Urus niaga saya', wallet: 'Dompet', messages: 'Mesej', support: 'Sokongan', ads: 'Iklan saya', favorites: 'Kegemaran', panel: 'Panel', account: 'Akaun', verification: 'Pengesahan', settings: 'Tetapan', logout: 'Log keluar', p2pMarket: 'Pasaran P2P' },
  },
  hi: {
    nav: { market: 'P2P ट्रेडिंग', deals: 'मेरे सौदे', wallet: 'वॉलेट', messages: 'संदेश', support: 'सहायता', ads: 'मेरे विज्ञापन', favorites: 'पसंदीदा', panel: 'पैनल', account: 'खाता', verification: 'सत्यापन', settings: 'सेटिंग्स', logout: 'लॉग आउट', p2pMarket: 'P2P मार्केट' },
  },
  bn: {
    nav: { market: 'P2P ট্রেড', deals: 'আমার লেনদেন', wallet: 'ওয়ালেট', messages: 'বার্তা', support: 'সহায়তা', ads: 'আমার বিজ্ঞাপন', favorites: 'পছন্দ', panel: 'প্যানেল', account: 'অ্যাকাউন্ট', verification: 'যাচাই', settings: 'সেটিংস', logout: 'লগ আউট', p2pMarket: 'P2P মার্কেট' },
  },
  th: {
    nav: { market: 'เทรด P2P', deals: 'ดีลของฉัน', wallet: 'กระเป๋าเงิน', messages: 'ข้อความ', support: 'สนับสนุน', ads: 'ประกาศของฉัน', favorites: 'รายการโปรด', panel: 'แผง', account: 'บัญชี', verification: 'ยืนยัน', settings: 'การตั้งค่า', logout: 'ออกจากระบบ', p2pMarket: 'ตลาด P2P' },
  },
  'zh-TW': {
    nav: { market: 'P2P 交易', deals: '我的訂單', wallet: '錢包', messages: '訊息', support: '支援', ads: '我的廣告', favorites: '收藏', panel: '面板', account: '帳戶', verification: '驗證', settings: '設定', logout: '登出', p2pMarket: 'P2P 市場' },
  },
  'es-419': {
    nav: { market: 'Trading P2P', deals: 'Mis operaciones', wallet: 'Billetera', messages: 'Mensajes', support: 'Soporte', ads: 'Mis anuncios', favorites: 'Favoritos', panel: 'Panel', account: 'Cuenta', verification: 'Verificación', settings: 'Ajustes', logout: 'Salir', p2pMarket: 'Mercado P2P' },
  },
};

export function getAppMessages(locale: LocaleId): AppMessages {
  const patch = APP_TRANSLATIONS[locale];
  return patch ? deepMergeApp(APP_EN, patch) : APP_EN;
}

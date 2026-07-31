'use client';

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } };
  ready: () => void;
  expand: () => void;
  close?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  themeParams?: Record<string, string>;
  colorScheme?: 'light' | 'dark';
  viewportHeight?: number;
  viewportStableHeight?: number;
  isExpanded?: boolean;
  platform?: string;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  HapticFeedback?: { impactOccurred: (style: string) => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

let viewportBound = false;

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramMiniApp(): boolean {
  const wa = getTelegramWebApp();
  return Boolean(wa?.initData && wa.initData.length > 0);
}

export function getTelegramInitData(): string | null {
  const wa = getTelegramWebApp();
  if (wa?.initData) return wa.initData;
  return null;
}

function syncViewportCss(wa: TelegramWebApp) {
  const h = wa.viewportStableHeight || wa.viewportHeight || window.innerHeight;
  const root = document.documentElement;
  root.style.setProperty('--tg-viewport-height', `${wa.viewportHeight || h}px`);
  root.style.setProperty('--tg-viewport-stable-height', `${h}px`);
  root.style.setProperty('--app-height', `${h}px`);
  document.body.style.minHeight = `${h}px`;
}

/** Apply Telegram viewport / theme so UI fills Mini App correctly. */
export function setupTelegramUi(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  try {
    wa.ready();
    wa.expand();
    wa.setHeaderColor?.('#07090F');
    wa.setBackgroundColor?.('#07090F');
    wa.disableVerticalSwipes?.();
    document.documentElement.classList.add('tg-miniapp');
    document.body.classList.add('tg-miniapp');
    if (wa.platform) {
      document.documentElement.dataset.tgPlatform = wa.platform;
    }
    syncViewportCss(wa);
    if (!viewportBound && wa.onEvent) {
      viewportBound = true;
      const onChange = () => syncViewportCss(wa);
      wa.onEvent('viewportChanged', onChange);
      window.addEventListener('resize', onChange);
    }
    return Boolean(wa.initData);
  } catch {
    return false;
  }
}

/** Wait briefly for telegram-web-app.js to inject WebApp. */
export function waitForTelegramWebApp(timeoutMs = 2500): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    const existing = getTelegramWebApp();
    if (existing?.initData) {
      resolve(existing);
      return;
    }
    const started = Date.now();
    const tick = () => {
      const wa = getTelegramWebApp();
      if (wa?.initData) {
        resolve(wa);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(getTelegramWebApp());
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

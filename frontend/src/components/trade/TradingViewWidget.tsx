'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Script from 'next/script';
import { useLocale } from '@/lib/i18n/locale-context';
import type { LocaleId } from '@/lib/i18n/locales';

type Props = {
  symbol: string;
  height?: number | string;
};

const TV_LOCALE: Partial<Record<LocaleId, string>> = {
  en: 'en', ru: 'ru', uk: 'ru', de: 'de', fr: 'fr', es: 'es', it: 'it', pl: 'pl',
  tr: 'tr', vi: 'vi', nl: 'nl', 'zh-CN': 'zh', 'zh-TW': 'zh_TW', ko: 'ko',
  pt: 'pt', cs: 'cs', da: 'da', no: 'no', sv: 'sv', fi: 'fi', hu: 'hu', ro: 'ro',
  el: 'el', ms: 'ms', hi: 'in', bn: 'en', th: 'th', 'es-419': 'es',
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => void;
    };
  }
}

let tvScriptLoaded = false;

export function TradingViewWidget({ symbol, height = 'min(560px, calc(100dvh - 240px))' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const { locale } = useLocale();
  const reactId = useId().replace(/:/g, '');
  const containerId = `tv_${reactId}`;
  const [scriptReady, setScriptReady] = useState(tvScriptLoaded);

  const initWidget = useCallback(() => {
    const el = containerRef.current;
    if (!el || !window.TradingView?.widget) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;

    el.innerHTML = '';
    new window.TradingView.widget({
      autosize: true,
      width: '100%',
      height: '100%',
      symbol,
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: TV_LOCALE[locale] ?? 'en',
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: containerId,
      studies: [],
      withdateranges: true,
      allow_symbol_change: false,
    });
    mountedRef.current = true;
    return true;
  }, [symbol, locale, containerId]);

  useEffect(() => {
    if (!scriptReady) return;
    const el = containerRef.current;
    if (!el) return;

    if (initWidget()) return;

    const ro = new ResizeObserver(() => {
      if (!mountedRef.current) initWidget();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      mountedRef.current = false;
      el.innerHTML = '';
    };
  }, [scriptReady, initWidget]);

  useEffect(() => {
    if (!scriptReady) return;
    mountedRef.current = false;
    initWidget();
  }, [symbol, locale, scriptReady, initWidget]);

  return (
    <>
      {!tvScriptLoaded && (
        <Script
          src="https://s3.tradingview.com/tv.js"
          strategy="afterInteractive"
          onLoad={() => {
            tvScriptLoaded = true;
            setScriptReady(true);
          }}
        />
      )}
      <div
        id={containerId}
        ref={containerRef}
        className="relative isolate z-0 w-full min-h-[420px] rounded-lg border border-nexora-border bg-[#0B0E14] touch-auto"
        style={{ height }}
      />
    </>
  );
}

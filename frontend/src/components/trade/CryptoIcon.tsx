'use client';

const COLOR: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  XRP: '#23292F',
  BNB: '#F3BA2F',
  ADA: '#0033AD',
  DOGE: '#C2A633',
  TON: '#0098EA',
  AVAX: '#E84142',
  DOT: '#E6007A',
  LINK: '#2A5ADA',
  POL: '#8247E5',
  LTC: '#345D9D',
  BCH: '#8DC351',
  ATOM: '#2E3148',
  NEAR: '#00C08B',
  APT: '#1B1B1B',
  ARB: '#28A0F0',
  OP: '#FF0420',
  SUI: '#4DA2FF',
  TRX: '#FF0013',
  SHIB: '#FFA409',
  UNI: '#FF007A',
  AAVE: '#B6509E',
  PEPE: '#3D9A40',
  WIF: '#C49A6C',
  FIL: '#0090FF',
  ICP: '#29ABE2',
  XLM: '#14B6E7',
  ETC: '#328332',
  XMR: '#FF6600',
  RENDER: '#000000',
  FET: '#1D1D1D',
  TAO: '#F5F5F5',
  NOT: '#000000',
};

type Props = {
  symbol: string;
  size?: number;
  className?: string;
};

export function CryptoIcon({ symbol, size = 20, className = '' }: Props) {
  const s = symbol.toUpperCase().replace(/USDT|USD|EUR|RUB/g, '').slice(0, 10) || symbol.toUpperCase();
  const src = `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${s.toLowerCase()}.svg`;
  const bg = COLOR[s] ?? '#7B5CFF';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, background: `${bg}22` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={s}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = 'none';
          const parent = el.parentElement;
          if (parent && !parent.querySelector('[data-fallback]')) {
            const span = document.createElement('span');
            span.dataset.fallback = '1';
            span.style.cssText = `font-size:${Math.max(8, size * 0.38)}px;font-weight:800;color:${bg}`;
            span.textContent = s.slice(0, 2);
            parent.appendChild(span);
          }
        }}
      />
    </span>
  );
}

export const fmtNum = (value: string | number, decimals = 2): string => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export const fmtCrypto = (value: string | number) => fmtNum(value, 6);
export const fmtFiat = (value: string | number) => fmtNum(value, 2);

export const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const timeLeft = (iso?: string | null): string => {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'истекло';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const dealStatusLabel: Record<string, string> = {
  CREATED: 'Ожидает оплаты',
  PAID: 'Оплачено',
  RELEASED: 'Отпущено',
  COMPLETED: 'Завершено',
  CANCELLED: 'Отменено',
  EXPIRED: 'Истекло',
  DISPUTED: 'Спор',
};

export const dealStatusColor: Record<string, string> = {
  CREATED: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  PAID: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  RELEASED: 'bg-nexora-success/15 text-nexora-success border border-nexora-success/20',
  COMPLETED: 'bg-nexora-success/15 text-nexora-success border border-nexora-success/20',
  CANCELLED: 'bg-white/5 text-nexora-muted border border-white/10',
  EXPIRED: 'bg-white/5 text-nexora-muted border border-white/10',
  DISPUTED: 'bg-nexora-error/15 text-nexora-error border border-nexora-error/20',
};

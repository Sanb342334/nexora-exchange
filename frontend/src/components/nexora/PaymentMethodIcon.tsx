'use client';

const bankStyles: Record<string, { bg: string; label: string }> = {
  kaspi: { bg: 'bg-gradient-to-br from-[#F03D3D] to-[#C62828]', label: 'K' },
  halyk: { bg: 'bg-gradient-to-br from-[#00A651] to-[#008744]', label: 'H' },
  visa: { bg: 'bg-gradient-to-br from-[#1A1F71] to-[#2E3192]', label: 'V' },
  mastercard: { bg: 'bg-gradient-to-br from-[#EB001B] via-[#F79E1B] to-[#FF5F00]', label: 'M' },
  sbp: { bg: 'bg-gradient-to-br from-[#21A038] to-[#1B8A30]', label: 'С' },
  card: { bg: 'bg-gradient-to-br from-[#374151] to-[#1F2937]', label: '•' },
};

function detectBank(type: string, bankName?: string | null): keyof typeof bankStyles {
  const hay = `${type} ${bankName ?? ''}`.toLowerCase();
  if (hay.includes('kaspi') || hay.includes('каспи')) return 'kaspi';
  if (hay.includes('halyk') || hay.includes('халык')) return 'halyk';
  if (hay.includes('visa')) return 'visa';
  if (hay.includes('master') || hay.includes('mc')) return 'mastercard';
  if (type === 'SBP' || hay.includes('сбп')) return 'sbp';
  return 'card';
}

/** Square payment icons like mockup (Kaspi, Halyk, Visa, MC) */
export function PaymentMethodIcon({
  type,
  bankName,
  compact,
}: {
  type: string;
  bankName?: string | null;
  compact?: boolean;
}) {
  const key = detectBank(type, bankName);
  const style = bankStyles[key];

  if (!compact && bankName && key === 'card') {
    return (
      <span className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-nexora-muted">
        {bankName}
      </span>
    );
  }

  return (
    <span
      title={bankName ?? key}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[10px] font-black text-white shadow-md ${style.bg}`}
    >
      {style.label}
    </span>
  );
}

export function PaymentMethodRow({
  methods,
}: {
  methods: { paymentMethod: { id: string; type: string; bankName?: string | null } }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      {methods.slice(0, 4).map((p) => (
        <PaymentMethodIcon
          key={p.paymentMethod.id}
          type={p.paymentMethod.type}
          bankName={p.paymentMethod.bankName}
          compact
        />
      ))}
    </div>
  );
}

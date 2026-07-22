'use client';

import { CheckCircle2 } from 'lucide-react';

const avatarGradients = [
  'from-[#7B61FF] to-[#6F3DFF]',
  'from-[#0ECB81] to-[#059669]',
  'from-[#3B82F6] to-[#1D4ED8]',
  'from-[#F59E0B] to-[#D97706]',
  'from-[#EC4899] to-[#BE185D]',
];

function hashName(name: string) {
  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function TraderAvatar({
  name,
  size = 40,
  showPhoto,
}: {
  name: string;
  size?: number;
  showPhoto?: boolean;
}) {
  const grad = avatarGradients[hashName(name) % avatarGradients.length];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className="relative shrink-0 rounded-full bg-gradient-to-br p-[2px] from-nexora-accent/50 to-nexora-accent/20"
      style={{ width: size, height: size }}
    >
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${grad} text-sm font-bold text-white`}
      >
        {showPhoto ? (
          <span className="text-lg">{initial}</span>
        ) : (
          initial
        )}
      </div>
    </div>
  );
}

export function TraderRow({
  name,
  trustScore,
  completedDeals,
}: {
  name: string;
  trustScore?: number | null;
  completedDeals?: number | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <TraderAvatar name={name} size={44} />
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white text-[15px]">{name}</span>
          <CheckCircle2 size={14} className="text-nexora-accent fill-nexora-accent/20" />
        </div>
        <div className="text-[12px] text-nexora-muted mt-0.5">
          {trustScore != null && (
            <>
              <span className="text-nexora-neon font-semibold">{trustScore}%</span>
              {completedDeals != null && ' | '}
            </>
          )}
          {completedDeals != null && `${completedDeals} сделок`}
          {trustScore == null && completedDeals == null && 'Верифицирован'}
        </div>
      </div>
    </div>
  );
}

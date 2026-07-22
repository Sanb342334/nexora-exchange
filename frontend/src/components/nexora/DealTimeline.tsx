'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 'CREATED', label: 'Создана' },
  { id: 'PAID', label: 'Оплачена' },
  { id: 'RELEASED', label: 'Подтверждена' },
  { id: 'COMPLETED', label: 'Завершена' },
];

function stepIndex(status: string) {
  const map: Record<string, number> = {
    CREATED: 0,
    PAID: 1,
    RELEASED: 2,
    COMPLETED: 3,
    DISPUTED: 1,
    CANCELLED: -1,
    EXPIRED: -1,
  };
  return map[status] ?? 0;
}

export function DealTimeline({ status }: { status: string }) {
  const current = stepIndex(status);
  if (current < 0) return null;

  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#0B0E14] p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-nexora-muted mb-4">
        Прогресс сделки
      </div>
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const done = i <= current;
          const active = i === current;
          return (
            <div key={s.id} className="flex flex-1 flex-col items-center relative">
              {i > 0 && (
                <div
                  className="absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2"
                  style={{ width: '100%', left: '-50%' }}
                >
                  <div className={`h-full ${i <= current ? 'bg-nexora-neon' : 'bg-white/10'}`} />
                </div>
              )}
              <motion.div
                initial={false}
                animate={{ scale: active ? 1.1 : 1 }}
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  done
                    ? 'border-nexora-neon bg-nexora-neon/20 text-nexora-neon'
                    : 'border-white/15 bg-[#10131C] text-nexora-muted'
                }`}
              >
                {done && i < current ? <Check size={12} strokeWidth={3} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
              </motion.div>
              <span className={`mt-2 text-[10px] font-medium text-center ${done ? 'text-white' : 'text-nexora-muted'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

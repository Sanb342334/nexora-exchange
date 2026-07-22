'use client';

import { motion } from 'framer-motion';
import { ReactNode, useState } from 'react';

export function RippleButton({
  children,
  className = '',
  onClick,
  variant = 'success',
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'success' | 'primary' | 'danger' | 'outline';
  disabled?: boolean;
}) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const variants = {
    success: 'bg-[#0ECB81] hover:bg-[#0ECB81]/90 text-[#0B0E14] shadow-neon-sm',
    primary: 'bg-nexora-gradient text-white shadow-glow',
    danger: 'bg-nexora-error text-white',
    outline: 'border border-nexora-accent/40 text-nexora-accent bg-transparent hover:bg-nexora-accent/10',
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((r) => [...r, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600);
    onClick?.();
  };

  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      onClick={handleClick}
      className={`relative overflow-hidden rounded-[12px] px-5 py-2 text-sm font-bold transition ${variants[variant]} ${className} disabled:opacity-50`}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute rounded-full bg-white/30 animate-ping"
          style={{ left: r.x - 8, top: r.y - 8, width: 16, height: 16 }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}

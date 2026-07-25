'use client';

import { ReactNode } from 'react';

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
  const variants = {
    success: 'bg-[#0ECB81] hover:bg-[#0ECB81]/90 text-[#07090F] shadow-neon-sm',
    primary: 'bg-nexora-gradient text-white shadow-glow',
    danger: 'bg-nexora-error text-white',
    outline: 'border border-nexora-accent/40 text-nexora-accent bg-transparent hover:bg-nexora-accent/10',
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative overflow-hidden rounded-[12px] px-5 py-2 text-sm font-bold touch-action-manipulation active:scale-[0.96] active:brightness-95 transition-[transform,filter] duration-75 ${variants[variant]} ${className} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

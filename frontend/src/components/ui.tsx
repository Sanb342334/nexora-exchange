'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Card({
  title,
  children,
  className = '',
  action,
  noPadding,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  noPadding?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`glass-card ${noPadding ? '' : 'p-5'} ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4 px-5 pt-5">
          {title && <h3 className="font-display text-sm font-semibold text-nexora-text">{title}</h3>}
          {action}
        </div>
      )}
      <div className={noPadding && !title ? '' : title || action ? 'px-5 pb-5' : ''}>{children}</div>
    </motion.div>
  );
}

export function Stat({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: string;
}) {
  const isPositive = trend?.startsWith('+');
  return (
    <div className="glass-card p-4 min-w-[140px]">
      <div className="text-[11px] font-medium uppercase tracking-wide text-nexora-muted">{label}</div>
      <div className="mt-2 font-display text-xl font-bold text-white">{value}</div>
      {(hint || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {trend && (
            <span className={isPositive ? 'text-nexora-success' : 'text-nexora-error'}>{trend}</span>
          )}
          {hint && <span className="text-nexora-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function Empty({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 text-nexora-muted opacity-50">{icon}</div>}
      <p className="text-sm text-nexora-muted">{text}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-nexora-accent border-t-transparent" />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} glass-card p-6 shadow-glow`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          {title ? <h3 className="font-display text-lg font-bold text-white">{title}</h3> : <div />}
          <button onClick={onClose} className="text-nexora-muted hover:text-white text-xl leading-none ml-auto">
            ×
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function VerifiedBadge() {
  return (
    <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/20">
      ✓ Верифицирован
    </Badge>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-nexora-muted">{subtitle}</p>}
      </div>
      {action}
    </motion.div>
  );
}

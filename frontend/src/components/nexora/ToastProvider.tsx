'use client';

import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const ToastCtx = createContext<(type: ToastType, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: 'border-[#4CAF50]/30 bg-[#4CAF50]/10 text-[#4CAF50]',
  error: 'border-nexora-error/30 bg-nexora-error/10 text-nexora-error',
  info: 'border-nexora-accent/30 bg-nexora-accent/10 text-nexora-accent',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-20 xl:bottom-6 right-4 xl:right-6 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = icons[t.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 text-sm font-medium shadow-glow backdrop-blur-xl pointer-events-auto ${styles[t.type]}`}
              >
                <Icon size={18} />
                {t.message}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { NexoraLogo } from '@/components/nexora/Logo';
import { CoinScene } from '@/components/nexora/CoinScene';
import { CryptoCoin } from '@/components/nexora/CryptoCoin';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password, totpCode || undefined);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка входа';
      if (message.includes('двухфактор')) setNeedTotp(true);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0B0E14]">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(123,97,255,0.2),transparent_70%)]" />
        <motion.div
          className="absolute top-20 left-16 opacity-40"
          animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 5 }}
        >
          <CryptoCoin kind="btc" size={40} />
        </motion.div>
        <motion.div
          className="absolute bottom-32 right-20 opacity-40"
          animate={{ y: [0, 10, 0], rotate: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 4, delay: 0.5 }}
        >
          <CryptoCoin kind="usdt" size={36} />
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="relative z-10 text-center">
          <NexoraLogo />
          <div className="mt-10 flex justify-center"><CoinScene /></div>
          <h1 className="mt-8 font-display text-3xl font-bold text-white">Локальная биржа без границ</h1>
          <p className="mt-3 text-nexora-muted max-w-sm mx-auto">Premium P2P-платформа с motion-дизайном и эскроу-защитой</p>
        </motion.div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center"><NexoraLogo /></div>
          <div className="rounded-[18px] border border-white/[0.08] bg-nexora-card/80 backdrop-blur-xl p-8 shadow-glow">
          <h2 className="font-display text-2xl font-bold text-white">Вход в NEXORA</h2>
          <p className="mt-1 text-sm text-nexora-muted">P2P Exchange Platform</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="label">Логин</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {needTotp && (
              <div>
                <label className="label">Код 2FA</label>
                <input className="input" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" />
              </div>
            )}
            {error && (
              <div className="rounded-[12px] bg-nexora-error/10 border border-nexora-error/30 px-4 py-3 text-sm text-nexora-error">{error}</div>
            )}
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(123,97,255,0.4)' }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 shadow-glow"
            >
              {loading ? 'Вход...' : 'Войти'}
            </motion.button>
          </form>

          <div className="mt-5 rounded-[14px] border border-white/[0.06] bg-white/[0.03] p-4 text-xs text-nexora-muted">
            admin / Admin12345! · trader1 / Trader12345!
          </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

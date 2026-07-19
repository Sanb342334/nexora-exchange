'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-brand">P2P Exchange</div>
          <div className="text-sm text-gray-500 mt-1">Внутренняя платформа по продаже USDT</div>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Логин</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {needTotp && (
            <div>
              <label className="label">Код 2FA</label>
              <input
                className="input"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
              />
            </div>
          )}
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Вход...' : 'Войти'}
          </button>
          <div className="text-xs text-gray-500 text-center">
            Демо: admin / Admin12345! · trader1 / Trader12345!
          </div>
        </form>
      </div>
    </div>
  );
}

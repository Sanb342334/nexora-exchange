'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, ApiError } from '@/lib/api';
import { Card, Spinner, Empty, Field, Badge, Modal } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import type { User } from '@/lib/types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [manage, setManage] = useState<User | null>(null);

  const load = () => apiGet<User[]>('/admin/users').then(setUsers).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Сотрудники</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">+ Добавить сотрудника</button>
      </div>

      <Card>
        {users.length === 0 ? (
          <Empty text="Сотрудников нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="th">Логин</th>
                  <th className="th">Имя</th>
                  <th className="th">Статус</th>
                  <th className="th">Лимит сделок</th>
                  <th className="th">Последний вход</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.07]/50">
                    <td className="td font-mono">@{u.username}</td>
                    <td className="td">{u.displayName ?? '—'}</td>
                    <td className="td">
                      <Badge className={u.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                        {u.status}
                      </Badge>
                    </td>
                    <td className="td">{u.maxOpenDeals}</td>
                    <td className="td text-gray-400">{fmtDate(u.createdAt)}</td>
                    <td className="td">
                      <button onClick={() => setManage(u)} className="text-nexora-accent text-xs">Управление</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); load(); }} />}
      {manage && <ManageUserModal user={manage} onClose={() => setManage(null)} onDone={() => { setManage(null); load(); }} />}
    </div>
  );
}

function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [takerFee, setTakerFee] = useState('0.005');
  const [spread, setSpread] = useState('0.01');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await apiPost('/admin/users', {
        username,
        password,
        displayName,
        takerFee: parseFloat(takerFee),
        spread: parseFloat(spread),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <Modal open onClose={onClose} title="Новый сотрудник">
      <div className="space-y-3">
        <Field label="Логин"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Пароль"><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Имя"><input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Комиссия (доля)"><input className="input" type="number" step="0.001" value={takerFee} onChange={(e) => setTakerFee(e.target.value)} /></Field>
          <Field label="Спред (доля)"><input className="input" type="number" step="0.001" value={spread} onChange={(e) => setSpread(e.target.value)} /></Field>
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button onClick={submit} className="btn-primary w-full">Создать</button>
      </div>
    </Modal>
  );
}

function ManageUserModal({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [maxOpenDeals, setMaxOpenDeals] = useState(String(user.maxOpenDeals ?? 5));
  const [takerFee, setTakerFee] = useState(user.takerFee ?? '');
  const [spread, setSpread] = useState(user.spread ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [adjCurrency, setAdjCurrency] = useState('USDT');
  const [adjAmount, setAdjAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await apiPatch(`/admin/users/${user.id}`, {
        maxOpenDeals: parseInt(maxOpenDeals, 10),
        takerFee: takerFee ? parseFloat(takerFee) : undefined,
        spread: spread ? parseFloat(spread) : undefined,
      });
      setMsg('Сохранено');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  const toggleBlock = async () => {
    await apiPatch(`/admin/users/${user.id}`, { blocked: user.status !== 'BLOCKED' });
    onDone();
  };

  const resetPass = async () => {
    if (!newPassword) return;
    await apiPost(`/admin/users/${user.id}/reset-password`, { newPassword });
    setMsg('Пароль сброшен');
    setNewPassword('');
  };

  const adjust = async () => {
    setError('');
    try {
      await apiPost('/admin/treasury/adjust', {
        userId: user.id,
        currency: adjCurrency,
        amount: parseFloat(adjAmount),
        description: 'Ручная корректировка',
      });
      setMsg('Баланс скорректирован');
      setAdjAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Управление · @${user.username}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Лимит сделок"><input className="input" type="number" value={maxOpenDeals} onChange={(e) => setMaxOpenDeals(e.target.value)} /></Field>
          <Field label="Комиссия"><input className="input" type="number" step="0.001" value={takerFee} onChange={(e) => setTakerFee(e.target.value)} /></Field>
          <Field label="Спред"><input className="input" type="number" step="0.001" value={spread} onChange={(e) => setSpread(e.target.value)} /></Field>
        </div>
        <button onClick={save} className="btn-primary w-full">Сохранить настройки</button>

        <hr className="border-white/[0.07]" />
        <div className="text-sm font-semibold">Ручная корректировка баланса</div>
        <div className="grid grid-cols-3 gap-2 items-end">
          <Field label="Валюта">
            <select className="input" value={adjCurrency} onChange={(e) => setAdjCurrency(e.target.value)}>
              <option value="USDT">USDT</option>
              <option value="KZT">KZT</option>
            </select>
          </Field>
          <Field label="Сумма (+/-)"><input className="input" type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} /></Field>
          <button onClick={adjust} className="btn-secondary">Применить</button>
        </div>

        <hr className="border-white/[0.07]" />
        <div className="flex gap-2">
          <input className="input" placeholder="Новый пароль" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button onClick={resetPass} className="btn-secondary">Сбросить пароль</button>
        </div>

        <button onClick={toggleBlock} className={user.status === 'BLOCKED' ? 'btn-success w-full' : 'btn-danger w-full'}>
          {user.status === 'BLOCKED' ? 'Разблокировать' : 'Заблокировать'}
        </button>

        {error && <div className="text-sm text-red-400">{error}</div>}
        {msg && <div className="text-sm text-emerald-400">{msg}</div>}
      </div>
    </Modal>
  );
}

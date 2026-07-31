'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { Card, Empty } from '@/components/ui';
import { useToast } from '@/components/nexora/ToastProvider';

type UserRow = {
  id: string;
  username: string;
  displayName?: string | null;
  tradingCurrency: string;
  outcomeMode: 'RANDOM' | 'WIN' | 'LOSE';
  loggingEnabled: boolean;
  tradeLocked?: boolean;
  kycRequired?: boolean;
  withdrawRequireCardDeposit?: boolean;
  balance: string;
  pendingWithdraw: string;
};

type UserStats = {
  stats: { open: number; won: number; lost: number; volume: string; realizedPnl: string };
  balances: { currency: string; available: string; frozen: string }[];
};

type Stats = {
  users: number;
  openTrades: number;
  won: number;
  lost: number;
  volume: string;
  payoutCoef: number;
};

type OpenTrade = {
  id: string;
  pairId: string;
  direction: string;
  stake: string;
  currency: string;
  entryPrice: string;
  durationSec: number;
  createdAt: string;
  user: { id: string; username: string; displayName?: string | null; outcomeMode: string };
};

export default function AdminBinaryPage() {
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [balanceInput, setBalanceInput] = useState('');
  const [requisites, setRequisites] = useState('');
  const [payout, setPayout] = useState('1.96');
  const [logs, setLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  const reload = async () => {
    const [s, u, dep, ot] = await Promise.all([
      apiGet<Stats>('/binary/admin/stats'),
      apiGet<{ items: UserRow[] }>('/binary/admin/users?limit=100'),
      apiGet<{ requisites: string }>('/binary/deposit-info'),
      apiGet<OpenTrade[]>('/binary/admin/open-trades').catch(() => []),
    ]);
    setStats(s);
    setUsers(u.items);
    setRequisites(dep.requisites);
    setPayout(String(s.payoutCoef));
    setOpenTrades(ot);
  };

  useEffect(() => {
    reload().catch(() => {});
    const t = setInterval(() => reload().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, []);

  const selectUser = async (u: UserRow) => {
    setSelected(u);
    setBalanceInput(u.balance);
    const [l, st] = await Promise.all([
      apiGet<any[]>(`/binary/admin/users/${u.id}/logs`).catch(() => []),
      apiGet<UserStats>(`/binary/admin/users/${u.id}/stats`).catch(() => null),
    ]);
    setLogs(l);
    setUserStats(st);
  };

  const force = async (tradeId: string, result: 'WIN' | 'LOSE') => {
    await apiPost(`/binary/admin/trades/${tradeId}/force`, { result });
    toast('success', `Сделка закрыта как ${result}`);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Binary Ops · Управление графиком</h1>
        <p className="text-sm text-nexora-muted">
          WIN/LOSE для пользователя (все следующие сделки) или мгновенный исход по открытой сделке
        </p>
      </div>

      {stats && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {[
            ['Users', stats.users],
            ['Open', stats.openTrades],
            ['Won', stats.won],
            ['Lost', stats.lost],
            ['Volume', stats.volume],
          ].map(([l, v]) => (
            <Card key={String(l)}>
              <div className="text-[11px] uppercase text-nexora-muted">{l}</div>
              <div className="text-xl font-bold text-white mt-1">{v}</div>
            </Card>
          ))}
        </div>
      )}

      <Card title="Открытые сделки на графике" noPadding>
        <div className="max-h-[320px] overflow-y-auto divide-y divide-white/[0.04]">
          {openTrades.length === 0 ? (
            <Empty text="Нет открытых сделок" />
          ) : (
            openTrades.map((t) => (
              <div key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <div className="font-semibold text-white">
                    <span className={t.direction === 'UP' ? 'text-nexora-neon' : 'text-nexora-error'}>
                      {t.direction === 'UP' ? '▲' : '▼'}
                    </span>{' '}
                    {t.pairId} · {t.stake} {t.currency}
                  </div>
                  <div className="text-[11px] text-nexora-muted mt-0.5">
                    {t.user.displayName ?? t.user.username} · вход {Number(t.entryPrice).toFixed(4)} · {t.durationSec}с ·
                    режим {t.user.outcomeMode}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary text-xs py-1.5 bg-nexora-neon/30 text-nexora-neon" onClick={() => force(t.id, 'WIN')}>
                    WIN
                  </button>
                  <button type="button" className="btn-primary text-xs py-1.5 bg-nexora-error/30 text-nexora-error" onClick={() => force(t.id, 'LOSE')}>
                    LOSE
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Реквизиты и коэффициент">
          <label className="label">Реквизиты пополнения</label>
          <textarea className="input mt-1 min-h-[100px]" value={requisites} onChange={(e) => setRequisites(e.target.value)} />
          <label className="label mt-3">Payout coefficient</label>
          <input className="input mt-1" value={payout} onChange={(e) => setPayout(e.target.value)} />
          <button
            className="btn-primary mt-3"
            type="button"
            onClick={async () => {
              await apiPatch('/binary/admin/settings', {
                requisites,
                payout: parseFloat(payout),
              });
              toast('success', 'Настройки сохранены');
              await reload();
            }}
          >
            Сохранить
          </button>
        </Card>

        <Card title="Пользователи (режим исхода)" noPadding>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04]">
            {users.length === 0 ? (
              <Empty text="Нет пользователей" />
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selectUser(u)}
                  className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] ${selected?.id === u.id ? 'bg-nexora-accent/10' : ''}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-white">{u.displayName ?? u.username}</span>
                    <span className="text-xs text-nexora-neon">
                      {u.balance} {u.tradingCurrency}
                    </span>
                  </div>
                  <div className="text-[11px] text-nexora-muted mt-1">
                    Исход: {u.outcomeMode} · log: {u.loggingEnabled ? 'ON' : 'OFF'}
                    {u.tradeLocked ? ' · 🔒 KYC' : ''}
                    {u.withdrawRequireCardDeposit === false ? ' · вывод: free' : ' · вывод: P2P'}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      {selected && (
        <Card title={`Управление: ${selected.displayName ?? selected.username}`}>
          <p className="text-xs text-nexora-muted mb-3">
            Режим WIN/LOSE/RANDOM применяется ко всем следующим сделкам этого юзера на графике
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(['WIN', 'LOSE', 'RANDOM'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`btn-secondary text-xs ${selected.outcomeMode === mode ? 'ring-1 ring-nexora-accent' : ''}`}
                onClick={async () => {
                  await apiPatch(`/binary/admin/users/${selected.id}/outcome`, { mode });
                  toast('success', `Исход: ${mode}`);
                  await reload();
                  const u = (await apiGet<{ items: UserRow[] }>('/binary/admin/users?limit=100')).items.find(
                    (x) => x.id === selected.id,
                  );
                  if (u) setSelected(u);
                }}
              >
                {mode}
              </button>
            ))}
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={async () => {
                await apiPatch(`/binary/admin/users/${selected.id}/logging`, {
                  enabled: !selected.loggingEnabled,
                });
                toast('success', selected.loggingEnabled ? 'Логи OFF' : 'Логи ON — действия в реальном времени');
                await reload();
                selectUser({ ...selected, loggingEnabled: !selected.loggingEnabled });
              }}
            >
              Логирование {selected.loggingEnabled ? 'OFF' : 'ON'}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={async () => {
                const locked = !selected.tradeLocked;
                await apiPatch(`/binary/admin/users/${selected.id}/trade-lock`, {
                  locked,
                  kycRequired: locked,
                });
                toast('success', locked ? 'Торговля заблокирована · запрошена верификация' : 'Торговля разблокирована');
                await reload();
                setSelected({ ...selected, tradeLocked: locked, kycRequired: locked });
              }}
            >
              {selected.tradeLocked ? 'Снять ограничение' : 'Запросить KYC / блок торговли'}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={async () => {
                const required = !(selected.withdrawRequireCardDeposit !== false);
                await apiPatch(`/binary/admin/users/${selected.id}/withdraw-gate`, { required });
                toast(
                  'success',
                  required
                    ? 'Вывод: нужен P2P-депозит с карты'
                    : 'Вывод: ограничение отключено для этого пользователя',
                );
                await reload();
                setSelected({ ...selected, withdrawRequireCardDeposit: required });
              }}
            >
              {selected.withdrawRequireCardDeposit !== false
                ? 'Отключить проверку P2P для вывода'
                : 'Включить проверку P2P для вывода'}
            </button>
          </div>
          {userStats && (
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                ['Open', userStats.stats.open],
                ['Won', userStats.stats.won],
                ['Lost', userStats.stats.lost],
                ['Volume', userStats.stats.volume],
                ['PnL', userStats.stats.realizedPnl],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-white/[0.03] px-2 py-2">
                  <div className="text-[10px] text-nexora-muted">{k}</div>
                  <div className="text-sm font-bold text-white tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="label">Баланс ({selected.tradingCurrency})</label>
              <input className="input mt-1" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await apiPost(`/binary/admin/users/${selected.id}/balance`, {
                  amount: parseFloat(balanceInput),
                });
                toast('success', 'Баланс обновлён');
                await reload();
              }}
            >
              Установить баланс
            </button>
          </div>
          <div className="mt-4 space-y-2">
            <label className="label">Сообщение пользователю</label>
            <textarea className="input min-h-[70px]" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Текст…" />
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={async () => {
                if (!msg.trim()) return;
                await apiPost(`/binary/admin/users/${selected.id}/message`, { text: msg });
                toast('success', 'Сообщение отправлено');
                setMsg('');
              }}
            >
              Отправить сообщение
            </button>
          </div>
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2">Логи</div>
            <div className="max-h-48 overflow-y-auto text-xs space-y-1 text-nexora-muted">
              {logs.length === 0
                ? 'Нет логов (включите логирование)'
                : logs.map((l) => (
                    <div key={l.id} className="border-b border-white/[0.04] py-1">
                      {l.action} · {new Date(l.createdAt).toLocaleString()}
                    </div>
                  ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

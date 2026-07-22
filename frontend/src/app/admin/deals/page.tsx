'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty, Badge, Modal, Field } from '@/components/ui';
import { fmtCrypto, fmtFiat, fmtDate, dealStatusLabel, dealStatusColor } from '@/lib/format';
import type { Deal } from '@/lib/types';

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [resolve, setResolve] = useState<Deal | null>(null);

  const load = () => {
    const q = filter ? `?status=${filter}` : '';
    return apiGet<Deal[]>(`/admin/deals${q}`).then(setDeals).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useSocketEvent('deal:updated', () => load());
  useSocketEvent('dispute:opened', () => load());

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Сделки и споры</h1>
        <select className="input w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="CREATED">Ожидают оплаты</option>
          <option value="PAID">Оплачено</option>
          <option value="DISPUTED">Споры</option>
          <option value="COMPLETED">Завершено</option>
          <option value="CANCELLED">Отменено</option>
        </select>
      </div>

      <Card>
        {deals.length === 0 ? (
          <Empty text="Сделок нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="th">Код</th>
                  <th className="th">Покупатель</th>
                  <th className="th">Продавец</th>
                  <th className="th">Сумма</th>
                  <th className="th">Крипта</th>
                  <th className="th">Статус</th>
                  <th className="th">Дата</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-b border-white/[0.07]/50">
                    <td className="td font-mono">{d.code}</td>
                    <td className="td">{d.buyer.username}</td>
                    <td className="td">{d.seller.username}</td>
                    <td className="td">{fmtFiat(d.fiatAmount)} {d.fiat}</td>
                    <td className="td">{fmtCrypto(d.assetAmount)} {d.asset}</td>
                    <td className="td">
                      <Badge className={dealStatusColor[d.status]}>{dealStatusLabel[d.status]}</Badge>
                    </td>
                    <td className="td text-gray-400">{fmtDate(d.createdAt)}</td>
                    <td className="td">
                      {d.status === 'DISPUTED' && (
                        <button onClick={() => setResolve(d)} className="btn-danger text-xs px-2 py-1">
                          Решить спор
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {resolve && <ResolveModal deal={resolve} onClose={() => setResolve(null)} onDone={() => { setResolve(null); load(); }} />}
    </div>
  );
}

function ResolveModal({ deal, onClose, onDone }: { deal: Deal; onClose: () => void; onDone: () => void }) {
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');

  const resolve = async (winner: 'BUYER' | 'SELLER') => {
    setError('');
    try {
      await apiPost(`/admin/deals/${deal.id}/resolve`, { winner, resolution });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Спор по сделке ${deal.code}`}>
      <div className="space-y-4">
        <div className="text-sm text-gray-400">
          Причина: {deal.dispute?.reason ?? '—'}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="card"><div className="text-gray-400">Покупатель</div><div className="font-semibold">{deal.buyer.username}</div></div>
          <div className="card"><div className="text-gray-400">Продавец</div><div className="font-semibold">{deal.seller.username}</div></div>
        </div>
        <Field label="Комментарий к решению">
          <textarea className="input" value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </Field>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => resolve('BUYER')} className="btn-success">В пользу покупателя (отпустить)</button>
          <button onClick={() => resolve('SELLER')} className="btn-danger">В пользу продавца (вернуть)</button>
        </div>
      </div>
    </Modal>
  );
}

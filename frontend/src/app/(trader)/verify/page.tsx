'use client';

import { useCallback, useEffect, useState } from 'react';
import { Camera, CheckCircle2, FileImage, ShieldAlert, Upload } from 'lucide-react';
import { apiGet, apiPost, apiUpload, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/nexora/ToastProvider';

type KycMe = {
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason?: string | null;
  verified: boolean;
  latest?: {
    id: string;
    status: string;
    reviewNote?: string | null;
    createdAt: string;
  } | null;
};

type Slot = 'page1' | 'page2' | 'selfie';

export default function VerifyPage() {
  const toast = useToast();
  const [me, setMe] = useState<KycMe | null>(null);
  const [page1, setPage1] = useState('');
  const [page2, setPage2] = useState('');
  const [selfie, setSelfie] = useState('');
  const [busy, setBusy] = useState<Slot | 'submit' | null>(null);

  const load = useCallback(async () => {
    const data = await apiGet<KycMe>('/kyc/me');
    setMe(data);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useSocketEvent('kyc:updated', () => {
    load().catch(() => {});
  });

  const uploadSlot = async (slot: Slot, file: File | null) => {
    if (!file) return;
    setBusy(slot);
    try {
      const { url } = await apiUpload(file);
      if (slot === 'page1') setPage1(url);
      if (slot === 'page2') setPage2(url);
      if (slot === 'selfie') setSelfie(url);
      toast('success', 'Фото загружено');
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!page1 || !page2 || !selfie) {
      toast('error', 'Загрузите все три фото');
      return;
    }
    setBusy('submit');
    try {
      const data = await apiPost<KycMe>('/kyc/submit', {
        passportPage1Url: page1,
        passportPage2Url: page2,
        selfieUrl: selfie,
      });
      setMe(data);
      toast('success', 'Документы отправлены на проверку');
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Ошибка отправки');
    } finally {
      setBusy(null);
    }
  };

  const status = me?.status ?? 'NONE';
  const verified = status === 'APPROVED';
  const pending = status === 'PENDING';
  const rejected = status === 'REJECTED';

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-10">
      <h1 className="font-display text-2xl font-bold text-white">Верификация</h1>
      <p className="text-sm text-nexora-muted">KYC · паспорт и селфи с документом</p>

      <div
        className={`rounded-[14px] border px-4 py-3 flex items-center gap-3 ${
          verified
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : rejected
              ? 'border-red-500/40 bg-red-500/10'
              : pending
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-red-500/30 bg-red-500/5'
        }`}
      >
        {verified ? (
          <CheckCircle2 className="text-emerald-400 shrink-0" size={22} />
        ) : (
          <ShieldAlert className={pending ? 'text-amber-400 shrink-0' : 'text-red-400 shrink-0'} size={22} />
        )}
        <div>
          <div
            className={`text-sm font-bold ${
              verified ? 'text-emerald-400' : pending ? 'text-amber-300' : 'text-red-400'
            }`}
          >
            {verified
              ? 'Верификация пройдена'
              : pending
                ? 'На проверке'
                : rejected
                  ? 'Верификация не пройдена'
                  : 'Верификация не пройдена'}
          </div>
          <div className="text-xs text-white/55 mt-0.5">
            {verified
              ? 'Аккаунт подтверждён'
              : pending
                ? 'Документы на проверке у оператора'
                : rejected
                  ? me?.rejectReason || 'Загрузите документы повторно'
                  : 'Загрузите документы для прохождения KYC'}
          </div>
        </div>
      </div>

      {!verified && !pending && (
        <div className="glass-card p-5 space-y-4">
          <p className="text-sm text-nexora-muted leading-relaxed">
            Нужны чёткие фото: 2 страницы паспорта (или удостоверения) и селфи, где видно лицо и документ.
          </p>

          {(
            [
              ['page1', 'Паспорт · страница 1', page1, FileImage],
              ['page2', 'Паспорт · страница 2', page2, FileImage],
              ['selfie', 'Селфи с паспортом / удостоверением', selfie, Camera],
            ] as const
          ).map(([slot, label, url, Icon]) => (
            <label key={slot} className="block">
              <div className="text-[11px] uppercase text-nexora-muted mb-1.5 flex items-center gap-1.5">
                <Icon size={13} />
                {label}
              </div>
              <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-white/15 bg-white/[0.02] p-3">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={label} className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/[0.04] text-nexora-muted">
                    <Upload size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {url ? 'Фото загружено' : 'Выберите файл'}
                  </div>
                  <div className="text-[11px] text-nexora-muted">JPG / PNG · до 5 МБ</div>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={!!busy}
                  onChange={(e) => uploadSlot(slot, e.target.files?.[0] ?? null)}
                />
                <span className="btn-secondary text-xs py-1.5 pointer-events-none">
                  {busy === slot ? '…' : url ? 'Заменить' : 'Выбрать'}
                </span>
              </div>
            </label>
          ))}

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!!busy || !page1 || !page2 || !selfie}
            onClick={submit}
          >
            {busy === 'submit' ? 'Отправка…' : 'Отправить на проверку'}
          </button>
        </div>
      )}

      {pending && (
        <div className="glass-card p-5 text-sm text-nexora-muted">
          Заявка отправлена {me?.latest?.createdAt ? new Date(me.latest.createdAt).toLocaleString() : ''}.
          Ожидайте решения — статус обновится автоматически.
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import { NexoraLogo } from '@/components/nexora/Logo';
import { LanguageSelector } from '@/components/nexora/login/LanguageSelector';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function LegalModal({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#14141f] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-[#9ca3af]">{body}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-[#7132f5] py-3 text-sm font-semibold text-white hover:bg-[#8045ff] transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { login, loginWithTelegram, user, loading: authLoading, isTelegram } = useAuth();
  const router = useRouter();
  const { t } = useLocale();
  const l = t.login;
  const [nextPath, setNextPath] = useState('/trade');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [tgBusy, setTgBusy] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next?.startsWith('/') && !next.startsWith('//')) setNextPath(next);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      router.replace(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/trade');
    }
  }, [authLoading, user, router, nextPath]);

  useEffect(() => {
    if (authLoading || user || !isTelegram) return;
    let cancelled = false;
    setTgBusy(true);
    loginWithTelegram()
      .then((u) => {
        if (!cancelled && u) router.replace(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/trade');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не удалось войти через Telegram');
      })
      .finally(() => {
        if (!cancelled) setTgBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // intentionally once when telegram session without user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isTelegram]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password, totpCode || undefined);
      const dest =
        nextPath.startsWith('/') && !nextPath.startsWith('//')
          ? nextPath
          : '/trade';
      router.push(dest);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed';
      if (message.includes('двухфактор') || message.toLowerCase().includes('2fa')) setNeedTotp(true);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const privacyBody =
    'NEXORA collects account credentials, transaction data, and device information to provide P2P exchange services, prevent fraud, and comply with applicable regulations. We do not sell personal data to third parties. Contact support@nexora.local for data requests.';

  const termsBody =
    'By using NEXORA you agree to trade at your own risk within platform rules, complete KYC when required, and not engage in fraud or money laundering. NEXORA provides escrow tooling but is not responsible for off-platform payments. Service may be restricted by jurisdiction.';

  if (authLoading || tgBusy || (isTelegram && !error)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#07090F] text-nexora-muted text-sm">
        {isTelegram ? 'Вход через Telegram…' : 'Загрузка…'}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#0a0a0f] text-white">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <NexoraLogo />
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSelector />
          <Link
            href="/register"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#7132f5] transition hover:bg-[#7132f5]/10 sm:inline-flex"
          >
            {l.createAccount}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-8 pt-2">
        <div className="w-full max-w-[440px] rounded-2xl border border-white/[0.06] bg-[#14141f] px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="text-center text-[22px] font-semibold tracking-tight text-white sm:text-2xl">
            {l.signInTitle}
          </h1>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <input
              className="kraken-input w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={l.emailOrUsername}
              autoComplete="username"
              required
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="kraken-input w-full pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={l.password}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-white transition"
                aria-label={showPassword ? l.hidePassword : l.showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {needTotp && (
              <input
                className="kraken-input w-full"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder={l.totpCode}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            )}

            <p className="text-sm">
              <a href="mailto:support@nexora.local" className="text-[#7132f5] hover:underline">
                {l.forgotLink}
              </a>
            </p>

            {error && <p className="text-sm text-[#ff6b8a]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#7132f5] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#8045ff] disabled:opacity-60"
            >
              {loading ? l.signingIn : l.continue}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{l.or}</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.1] bg-[#0a0a0f] py-3 text-sm font-medium text-white transition hover:bg-white/[0.04]"
            >
              <GoogleIcon />
              {l.signInGoogle}
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.1] bg-[#0a0a0f] py-3 text-sm font-medium text-white transition hover:bg-white/[0.04]"
            >
              <AppleIcon />
              {l.signInApple}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-[#9ca3af]">
            {l.cantSignIn}{' '}
            <a href="mailto:support@nexora.local" className="text-[#7132f5] hover:underline">
              {l.emailUs}
            </a>
          </p>
        </div>
      </main>

      <footer className="px-4 pb-8 pt-2 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
          <button type="button" onClick={() => setLegalModal('privacy')} className="text-[#7132f5] hover:underline">
            {l.privacyNotice}
          </button>
          <span className="text-[#4b5563]">·</span>
          <button type="button" onClick={() => setLegalModal('terms')} className="text-[#7132f5] hover:underline">
            {l.termsOfService}
          </button>
        </div>
        <p className="mx-auto mt-4 max-w-xl text-[11px] leading-relaxed text-[#6b7280]">{l.legalNotice}</p>
        <Link
          href="/register"
          className="mt-4 inline-flex text-sm text-[#7132f5] hover:underline sm:hidden"
        >
          {l.createAccount}
        </Link>
      </footer>

      {legalModal === 'privacy' && (
        <LegalModal title={l.privacyNotice} body={privacyBody} onClose={() => setLegalModal(null)} />
      )}
      {legalModal === 'terms' && (
        <LegalModal title={l.termsOfService} body={termsBody} onClose={() => setLegalModal(null)} />
      )}
    </div>
  );
}

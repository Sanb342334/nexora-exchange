'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import {
  ALLOWED_COUNTRY_CODES,
  countryLabel,
  fiatLabel,
  getCountry,
} from '@/lib/i18n/countries';
import { NexoraLogo } from '@/components/nexora/Logo';
import { LanguageSelector } from '@/components/nexora/login/LanguageSelector';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const { t, locale } = useLocale();
  const r = t.app.register;
  const l = t.login;

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [countryCode, setCountryCode] = useState('KZ');
  const [preferredFiat, setPreferredFiat] = useState('KZT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const c = getCountry(countryCode);
    if (c && !c.fiats.includes(preferredFiat)) {
      setPreferredFiat(c.defaultFiat);
    }
  }, [countryCode, preferredFiat]);

  const fiats = getCountry(countryCode)?.fiats ?? ['KZT'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(r.mismatch);
      return;
    }
    setLoading(true);
    try {
      await register({
        username,
        password,
        email: email || undefined,
        countryCode,
        preferredFiat,
        locale,
      });
      router.push('/trade');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#0a0a0f] text-white">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <NexoraLogo />
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSelector />
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#7132f5] transition hover:bg-[#7132f5]/10"
          >
            {r.signIn}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-8 pt-2">
        <div className="w-full max-w-[440px] rounded-2xl border border-white/[0.06] bg-[#14141f] px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="text-center text-[22px] font-semibold tracking-tight sm:text-2xl">{r.title}</h1>
          <p className="mt-2 text-center text-sm text-[#9ca3af]">{r.subtitle}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <input className="kraken-input w-full" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={r.username} required minLength={3} autoComplete="username" />
            <input className="kraken-input w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={r.email} autoComplete="email" />

            <select className="kraken-input w-full" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} required aria-label={r.country}>
              <option value="" disabled>{r.selectCountry}</option>
              {ALLOWED_COUNTRY_CODES.map((code) => (
                <option key={code} value={code} className="bg-[#14141f]">
                  {countryLabel(code, locale)}
                </option>
              ))}
            </select>

            <select className="kraken-input w-full" value={preferredFiat} onChange={(e) => setPreferredFiat(e.target.value)} required aria-label={r.currency}>
              <option value="" disabled>{r.selectCurrency}</option>
              {fiats.map((f) => (
                <option key={f} value={f} className="bg-[#14141f]">
                  {fiatLabel(f, locale)}
                </option>
              ))}
            </select>

            <input className="kraken-input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={r.password} required minLength={8} autoComplete="new-password" />
            <input className="kraken-input w-full" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={r.confirmPassword} required minLength={8} autoComplete="new-password" />
            <p className="text-xs text-[#6b7280]">{r.passwordHint}</p>

            {error && <p className="text-sm text-[#ff6b8a]">{error}</p>}

            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#7132f5] py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#8045ff] disabled:opacity-60">
              {loading ? l.signingIn : r.createAccount}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#9ca3af]">
            {r.haveAccount}{' '}
            <Link href="/login" className="text-[#7132f5] hover:underline">{r.signIn}</Link>
          </p>
        </div>
      </main>

      <footer className="px-4 pb-8 pt-2 text-center">
        <p className="mx-auto max-w-xl text-[11px] leading-relaxed text-[#6b7280]">{l.legalNotice}</p>
      </footer>
    </div>
  );
}

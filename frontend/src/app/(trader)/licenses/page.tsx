'use client';

import Link from 'next/link';

export default function LicensesPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10">
      <h1 className="font-display text-2xl font-bold text-white">Лицензии и документы</h1>
      <p className="text-sm text-nexora-muted">Правовая информация платформы</p>

      <div className="glass-card p-5 space-y-4 text-sm text-nexora-muted leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">Лицензия</h2>
          <div className="rounded-[12px] border border-white/10 bg-white/[0.03] p-4 mb-3 space-y-1.5">
            <div className="text-white font-semibold">
              Virtual Asset Service Provider License
            </div>
            <div className="text-nexora-text">
              № <span className="font-mono text-nexora-neon">VASP-MW-2024/NX-11847</span>
            </div>
            <div className="text-xs">
              Issuer: Mwali International Services Authority (MISA)
            </div>
          </div>
          <p>
            NEXORA Options предоставляет программный интерфейс для торговли опционами и фьючерсами.
            Торговля сопряжена с риском потери средств. Используйте только средства, потеря которых для вас приемлема.
          </p>
        </section>
        <section>
          <h2 className="text-white font-semibold mb-2">Пользовательское соглашение</h2>
          <p>
            Регистрируясь, вы подтверждаете возраст 18+, достоверность данных и согласие на обработку операций
            операторами платформы (пополнение, вывод, модерация чеков).
          </p>
        </section>
        <section>
          <h2 className="text-white font-semibold mb-2">AML / KYC</h2>
          <p>
            По запросу оператора может потребоваться верификация. Отказ от KYC может ограничить вывод или пополнение.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/verify" className="btn-primary text-sm">
          Верификация
        </Link>
        <Link href="/faq" className="btn-secondary text-sm">
          FAQ
        </Link>
      </div>
    </div>
  );
}

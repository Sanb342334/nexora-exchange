'use client';

import Link from 'next/link';
import { ADMIN_SUITE_FEATURES } from '@/lib/exchange-catalog';
import { FeatureWorkbench } from '@/components/nexora/FeatureWorkbench';
import { Card } from '@/components/ui';
import { useState } from 'react';

export default function AdminSuitePage() {
  const [active, setActive] = useState(ADMIN_SUITE_FEATURES[0]?.slug);

  const feature = ADMIN_SUITE_FEATURES.find((f) => f.slug === active) ?? ADMIN_SUITE_FEATURES[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Ops Suite</h1>
        <p className="text-sm text-nexora-muted">
          {ADMIN_SUITE_FEATURES.length} операционных инструментов платформы
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <Card noPadding>
          <div className="max-h-[70vh] overflow-y-auto p-2 space-y-0.5">
            {ADMIN_SUITE_FEATURES.map((f) => {
              if (f.kind === 'link' && f.href) {
                return (
                  <Link key={f.slug} href={f.href} className="nav-link">
                    {f.titleRu}
                  </Link>
                );
              }
              return (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => setActive(f.slug)}
                  className={active === f.slug ? 'nav-link-active w-full text-left' : 'nav-link w-full text-left'}
                >
                  {f.titleRu}
                </button>
              );
            })}
          </div>
        </Card>
        <div>{feature && <FeatureWorkbench feature={feature} categoryTitle="Admin Ops" />}</div>
      </div>
    </div>
  );
}

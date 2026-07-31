'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { findCategory } from '@/lib/exchange-catalog';
import { Card, Empty } from '@/components/ui';

export default function SuiteCategoryPage() {
  const params = useParams<{ category: string }>();
  const category = findCategory(params.category);

  if (!category) {
    return <Empty text="Категория не найдена" />;
  }

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto w-full pb-6">
      <div>
        <Link href="/products" className="text-xs text-nexora-accent hover:underline">
          ← Все продукты
        </Link>
        <h1 className="font-display text-2xl font-bold text-white mt-2">{category.titleRu}</h1>
        <p className="text-sm text-nexora-muted">{category.titleEn} · {category.features.length} инструментов</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {category.features.map((f) => {
          const href = f.kind === 'link' && f.href ? f.href : `/suite/${category.id}/${f.slug}`;
          return (
            <Link key={f.slug} href={href}>
              <Card className="h-full hover:border-nexora-accent/30 transition border border-transparent">
                <div className="text-sm font-semibold text-white">{f.titleRu}</div>
                <div className="text-xs text-nexora-muted mt-1">{f.titleEn}</div>
                <div className="mt-3 text-[10px] uppercase tracking-wider text-nexora-accent">{f.kind}</div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

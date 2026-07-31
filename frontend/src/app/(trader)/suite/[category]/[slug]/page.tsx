'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { findCategory, findFeature } from '@/lib/exchange-catalog';
import { FeatureWorkbench } from '@/components/nexora/FeatureWorkbench';
import { Empty } from '@/components/ui';

export default function SuiteFeaturePage() {
  const params = useParams<{ category: string; slug: string }>();
  const category = findCategory(params.category);
  const feature = findFeature(params.slug);

  if (!feature) {
    return <Empty text="Инструмент не найден" />;
  }

  return (
    <div className="max-w-[1600px] mx-auto w-full pb-6 space-y-3">
      <div className="flex flex-wrap gap-2 text-xs text-nexora-muted">
        <Link href="/products" className="hover:text-nexora-accent">Продукты</Link>
        <span>/</span>
        {category && (
          <>
            <Link href={`/suite/${category.id}`} className="hover:text-nexora-accent">{category.titleRu}</Link>
            <span>/</span>
          </>
        )}
        <span className="text-white">{feature.titleRu}</span>
      </div>
      <FeatureWorkbench feature={feature} categoryTitle={category?.titleRu} />
    </div>
  );
}

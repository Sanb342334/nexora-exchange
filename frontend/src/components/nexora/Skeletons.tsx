'use client';

import { ReactNode } from 'react';

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3 w-1/4" />
          </div>
          <div className="skeleton h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-24 min-w-[150px] rounded-[18px]" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="skeleton h-48 rounded-[18px]" />
      <StatsSkeleton />
      <div className="skeleton h-96 rounded-[18px]" />
    </div>
  );
}

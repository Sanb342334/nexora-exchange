'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fadeScale } from '@/lib/motion';

export function PageMotion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeScale} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

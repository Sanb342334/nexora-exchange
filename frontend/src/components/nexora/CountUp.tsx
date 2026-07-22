'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

export function CountUp({
  end,
  duration = 1.2,
  suffix = '',
  className = '',
}: {
  end: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration * 60);
    const id = setInterval(() => {
      start += step;
      if (start >= end) {
        setVal(end);
        clearInterval(id);
      } else setVal(Math.floor(start));
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [inView, end, duration]);

  return (
    <motion.span ref={ref} className={className} initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}>
      {val.toLocaleString('ru-RU')}
      {suffix}
    </motion.span>
  );
}

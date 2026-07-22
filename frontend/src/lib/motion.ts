export const fadeScale = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export const hoverGlow = {
  rest: { scale: 1, boxShadow: '0 0 0 rgba(123,97,255,0)' },
  hover: { scale: 1.02, boxShadow: '0 0 24px rgba(123,97,255,0.25)' },
};

export const tableRow = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
};

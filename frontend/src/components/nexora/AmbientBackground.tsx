'use client';

export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-nexora-accent/[0.07] blur-[120px]" />
      <div className="absolute top-1/3 -right-32 h-[400px] w-[400px] rounded-full bg-[#4CAF50]/[0.04] blur-[100px]" />
      <div className="absolute bottom-0 left-1/3 h-[300px] w-[600px] rounded-full bg-nexora-accent2/[0.06] blur-[90px]" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
    </div>
  );
}

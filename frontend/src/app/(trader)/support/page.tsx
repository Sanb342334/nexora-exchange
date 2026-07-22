'use client';

import { motion } from 'framer-motion';
import { PageHeader, Card } from '@/components/ui';
import { PageMotion } from '@/components/nexora/PageMotion';
import { Headphones, Mail, MessageSquare, Shield, Zap, Lock } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/motion';

const contacts = [
  { icon: Headphones, label: 'Telegram', value: '@nexora_support', color: 'text-blue-400' },
  { icon: Mail, label: 'Email', value: 'support@nexora.local', color: 'text-purple-400' },
  { icon: MessageSquare, label: 'Время ответа', value: 'до 15 минут', color: 'text-[#4CAF50]' },
];

const faqs = [
  {
    q: 'Как создать заявку на покупку USDT?',
    a: 'Перейдите в «Мои объявления», укажите курс, объём и банк. Оператор свяжется с вами.',
  },
  {
    q: 'Как работает эскроу?',
    a: 'USDT блокируется до подтверждения оплаты. Вы защищены на каждом этапе сделки.',
  },
  {
    q: 'Что делать при споре?',
    a: 'Откройте спор на странице сделки — поддержка решит вопрос в течение 24 часов.',
  },
];

const features = [
  { icon: Shield, title: 'Эскроу-защита', desc: 'Средства заблокированы до завершения' },
  { icon: Zap, title: 'Быстрые сделки', desc: 'Среднее время — 15 минут' },
  { icon: Lock, title: 'Шифрование', desc: 'Данные защищены end-to-end' },
];

export default function SupportPage() {
  return (
    <PageMotion className="max-w-3xl space-y-6">
      <PageHeader title="Поддержка" subtitle="Мы на связи 24/7 — поможем с любой сделкой" />

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }) => (
          <motion.div
            key={title}
            variants={staggerItem}
            whileHover={{ y: -4, boxShadow: '0 0 24px rgba(123,97,255,0.12)' }}
            className="rounded-[18px] border border-white/[0.07] bg-nexora-card p-4 text-center"
          >
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-nexora-accent/15">
              <Icon size={20} className="text-nexora-accent" />
            </div>
            <div className="font-display text-sm font-bold text-white">{title}</div>
            <div className="mt-1 text-xs text-nexora-muted">{desc}</div>
          </motion.div>
        ))}
      </motion.div>

      <Card title="Связаться с нами">
        <div className="space-y-3">
          {contacts.map(({ icon: Icon, label, value, color }) => (
            <motion.div
              key={label}
              whileHover={{ x: 4 }}
              className="flex items-center gap-4 rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-4"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] ${color}`}>
                <Icon size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-nexora-muted">{label}</div>
                <div className="font-semibold text-white">{value}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      <Card title="Частые вопросы">
        <div className="space-y-4">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-4">
              <div className="font-semibold text-white text-sm">{f.q}</div>
              <p className="mt-2 text-sm text-nexora-muted leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </Card>
    </PageMotion>
  );
}

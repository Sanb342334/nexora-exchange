'use client';

import Link from 'next/link';

const FAQ = [
  {
    q: 'Как открыть сделку?',
    a: 'Выберите пару на экране «Торговля», укажите ставку и время, нажмите ВВЕРХ или ВНИЗ. Исход определяется по цене закрытия относительно точки входа.',
  },
  {
    q: 'Как пополнить баланс?',
    a: 'Откройте «Пополнение», укажите сумму и создайте заявку. Оператор пришлёт реквизиты именно для вашей заявки. После оплаты загрузите чек — баланс зачислят после проверки.',
  },
  {
    q: 'Можно ли отменить пополнение?',
    a: 'Да, пока заявка в статусе ожидания — нажмите «Отменить» на странице пополнения.',
  },
  {
    q: 'Как вывести средства?',
    a: 'Через кабинет / поддержку: укажите сумму и реквизиты. Оператор обработает заявку вручную.',
  },
  {
    q: 'Что такое верификация?',
    a: 'Подтверждение личности для повышения лимитов. Напишите в техподдержку — оператор запросит документы.',
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10">
      <h1 className="font-display text-2xl font-bold text-white">FAQ</h1>
      <p className="text-sm text-nexora-muted">Частые вопросы по торговле и кабинету NEXORA Options</p>
      <div className="space-y-3">
        {FAQ.map((item) => (
          <div key={item.q} className="glass-card p-4">
            <div className="font-semibold text-white text-sm">{item.q}</div>
            <p className="text-sm text-nexora-muted mt-2 leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
      <Link href="/support" className="btn-secondary inline-flex text-sm">
        Написать в поддержку
      </Link>
    </div>
  );
}

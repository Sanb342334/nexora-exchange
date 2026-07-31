# Запуск NEXORA Mini App (Telegram)

## 1. Локально

```bash
# PostgreSQL должен быть запущен (база p2p_exchange)

cd backend
cp .env.example .env   # если ещё нет
# заполните TELEGRAM_BOT_TOKEN и адреса депозитов
npx prisma db push
npm run seed           # admin / Admin12345!
npx tsc -p tsconfig.build.json
node dist/main.js      # http://localhost:4000

# второй терминал
cd frontend
npm run dev            # http://localhost:3000
```

## 2. Бот в Telegram

1. Откройте [@BotFather](https://t.me/BotFather) → ваш бот.
2. Скопируйте токен → `TELEGRAM_BOT_TOKEN` в `backend/.env`.
3. `Bot Settings` → `Menu Button` / `Configure Mini App` → URL:
   - прод: `https://ваш-домен`
   - локально: публичный HTTPS-туннель на `:3000` (ngrok / cloudflared), например  
     `https://xxxx.ngrok-free.app`
4. В `CORS_ORIGINS` добавьте этот HTTPS-URL.
5. Перезапустите backend.

## 3. Проверка

- Откройте бота в Telegram → Menu / кнопка Mini App.
- Вход без регистрации: сессия по `telegramId`, баланс сохраняется.
- Админка в браузере: `http://localhost:3000/admin` (`admin` / `Admin12345!`).

## Важно

- Mini App работает **только по HTTPS** (кроме localhost в Desktop TG — лучше сразу туннель).
- Один и тот же `TELEGRAM_BOT_TOKEN` используется для входа пользователей и уведомлений админам (`TELEGRAM_ADMIN_CHAT_IDS`).

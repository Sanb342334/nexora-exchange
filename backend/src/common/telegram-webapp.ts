import { createHmac, timingSafeEqual } from 'crypto';

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
};

export type ParsedTelegramInitData = {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
};

/**
 * Validates Telegram Mini App initData (HMAC-SHA-256).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function parseAndValidateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86_400,
): ParsedTelegramInitData {
  if (!initData?.trim()) {
    throw new Error('empty_init_data');
  }
  if (!botToken?.trim()) {
    throw new Error('bot_token_missing');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('hash_missing');

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('hash_invalid');
  }

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) throw new Error('auth_date_invalid');
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSec || age < -60) throw new Error('auth_date_expired');

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('user_missing');
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new Error('user_invalid');
  }
  if (!user?.id) throw new Error('user_id_missing');

  return {
    user,
    authDate,
    queryId: params.get('query_id') ?? undefined,
  };
}

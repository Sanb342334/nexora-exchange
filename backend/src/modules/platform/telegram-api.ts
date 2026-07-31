/** Shared Telegram Bot API helpers (no Nest DI). */

export function escapeTelegramHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function telegramSendHtml(
  token: string,
  chatId: string | number,
  text: string,
): Promise<boolean> {
  const t = token.trim();
  if (!t) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const json = (await res.json()) as { ok?: boolean };
    return !!json.ok;
  } catch {
    return false;
  }
}

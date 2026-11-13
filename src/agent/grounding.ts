const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Is this exact 6-digit code in the customer's LAST message?
export function userTypedCode(lastMessage: string, code: string): boolean {
  const codes: string[] = lastMessage.match(/\b\d{6}\b/g) ?? [];
  return codes.includes(code);
}

// Did the customer mention this month anywhere in the chat?
export function userMentionedMonth(messages: string[], month: string): boolean {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  if (!name) return false;
  const text = messages.join(" ").toLowerCase();
  return new RegExp(`\\b(${month}|${name}|${name.slice(0, 3)})\\b`).test(text);
}

// The month the customer named most recently, as "YYYY-MM" (no year → this year).
// "2026-10", "October 2026", "october" all work. Nothing named → null.
export function lastMentionedMonth(messages: string[], today: string): string | null {
  for (const message of messages.slice().reverse()) {
    const text = message.toLowerCase();
    const iso = text.match(/\b(\d{4})-(0[1-9]|1[0-2])\b/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const named = text.match(new RegExp(`\\b(${MONTH_NAMES.join("|")})\\b(?:\\s*,?\\s*(\\d{4}))?`));
    if (named) {
      const mm = String(MONTH_NAMES.indexOf(named[1]!) + 1).padStart(2, "0");
      return `${named[2] ?? today.slice(0, 4)}-${mm}`;
    }
  }
  return null;
}
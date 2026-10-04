type TelegramTraceDetails = Record<string, boolean | number | string | undefined>

export function traceTelegram(event: string, details: TelegramTraceDetails = {}) {
  console.info('[TG-TRACE]', event, details)
}

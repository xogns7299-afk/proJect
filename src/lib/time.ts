const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// UTC 밀리초 → 한국시간 날짜(YYYY-MM-DD)
export function kstDate(ms: number = Date.now()) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 해당 날짜가 속한 주의 월요일
export function weekStart(date: string = kstDate()) {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

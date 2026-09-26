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

// 형식뿐 아니라 실제로 있는 날짜인지도 본다 (2026-13-01, 2026-02-30 등은 거부)
export const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().startsWith(v)
// week 같은 선택 값: 비어 있으면 괜찮고, 값이 있으면 실제 날짜여야 한다
export const badDate = (v: unknown) => v !== undefined && v !== null && v !== '' && !isDate(v)
export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

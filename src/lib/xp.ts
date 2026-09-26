import { levelOf } from './rules'

export async function totalXp(db: D1Database, userId: number) {
  const row = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE user_id = ?').bind(userId).first<{ xp: number }>()
  return row?.xp ?? 0
}

export async function xpSummary(db: D1Database, userId: number) {
  const xp = await totalXp(db, userId)
  return { xp, ...levelOf(xp) }
}

// (type, ref_id)가 UNIQUE라서 같은 근거로 두 번 지급되지 않는다
export function grantXp(db: D1Database, userId: number, type: 'study_session' | 'weekly_goal', refId: number, amount: number) {
  return db
    .prepare('INSERT OR IGNORE INTO xp_events (user_id, type, ref_id, amount, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, type, refId, amount, Date.now())
}

export function revokeXp(db: D1Database, type: 'study_session' | 'weekly_goal', refId: number) {
  return db.prepare('DELETE FROM xp_events WHERE type = ? AND ref_id = ?').bind(type, refId)
}

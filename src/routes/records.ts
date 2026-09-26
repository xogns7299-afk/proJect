import { Hono } from 'hono'
import { type Env, body, fail, idParam, text } from '../lib/app'
import { addDays, isDate, kstDate, weekStart } from '../lib/time'
import { revokeXp } from '../lib/xp'

const records = new Hono<Env>()

records.get('/', async (c) => {
  const subjectId = Number(c.req.query('subjectId')) || null
  const from = c.req.query('from')
  const to = c.req.query('to')
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.subject_id AS subjectId, sub.name AS subject, sub.color, s.started_at AS startedAt, s.ended_at AS endedAt,
            s.start_date AS date, s.duration_sec AS durationSec, s.paused_total_sec AS pausedSec, s.pause_count AS pauseCount,
            s.memo, s.review_good AS reviewGood, s.review_hard AS reviewHard, s.review_note AS reviewNote,
            s.start_photo AS startPhoto, s.end_photo AS endPhoto
     FROM study_sessions s JOIN subjects sub ON sub.id = s.subject_id
     WHERE s.user_id = ?1 AND s.status = 'done'
       AND (?2 IS NULL OR s.subject_id = ?2)
       AND (?3 IS NULL OR s.start_date >= ?3)
       AND (?4 IS NULL OR s.start_date <= ?4)
     ORDER BY s.started_at DESC LIMIT 200`
  )
    .bind(c.get('user').id, subjectId, isDate(from) ? from : null, isDate(to) ? to : null)
    .all()
  return c.json(results)
})

records.get('/stats', async (c) => {
  const userId = c.get('user').id
  const today = kstDate()
  const monday = weekStart(today)
  const totals = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN start_date = ?2 THEN duration_sec END), 0) AS todaySec,
            COALESCE(SUM(CASE WHEN start_date BETWEEN ?3 AND ?4 THEN duration_sec END), 0) AS weekSec,
            COALESCE(SUM(duration_sec), 0) AS totalSec,
            COUNT(*) AS recordCount
     FROM study_sessions WHERE user_id = ?1 AND status = 'done'`
  )
    .bind(userId, today, monday, addDays(monday, 6))
    .first()
  const { results: bySubject } = await c.env.DB.prepare(
    `SELECT sub.id AS subjectId, sub.name AS subject, sub.color, COALESCE(SUM(s.duration_sec), 0) AS totalSec
     FROM subjects sub LEFT JOIN study_sessions s ON s.subject_id = sub.id AND s.status = 'done'
     WHERE sub.user_id = ? AND (sub.archived = 0 OR s.id IS NOT NULL)
     GROUP BY sub.id ORDER BY totalSec DESC`
  )
    .bind(userId)
    .all()
  return c.json({ ...totals, bySubject })
})

// 회고 저장. 보낸 칸만 바뀐다. memo(공부한 내용)만 스터디 피드에 보인다.
records.patch('/:id', async (c) => {
  const data = await body(c)
  const field = (v: unknown) => (v === undefined ? null : text(v, 1000))
  const result = await c.env.DB.prepare(
    `UPDATE study_sessions
     SET memo = COALESCE(?, memo), review_good = COALESCE(?, review_good),
         review_hard = COALESCE(?, review_hard), review_note = COALESCE(?, review_note)
     WHERE id = ? AND user_id = ? AND status = 'done'`
  )
    .bind(field(data.memo), field(data.reviewGood), field(data.reviewHard), field(data.reviewNote), idParam(c), c.get('user').id)
    .run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '기록을 찾을 수 없습니다')
})

// 기록을 지우면 그 기록으로 받은 경험치도 함께 되돌린다
records.delete('/:id', async (c) => {
  const id = idParam(c)
  const owned = await c.env.DB.prepare(`SELECT start_photo, end_photo FROM study_sessions WHERE id = ? AND user_id = ? AND status = 'done'`)
    .bind(id, c.get('user').id)
    .first<{ start_photo: string | null; end_photo: string | null }>()
  if (!owned) return fail(c, 404, '기록을 찾을 수 없습니다')
  for (const key of [owned.start_photo, owned.end_photo]) if (key) await c.env.PHOTOS.delete(key).catch(() => {})
  await c.env.DB.batch([
    revokeXp(c.env.DB, 'study_session', id),
    c.env.DB.prepare('DELETE FROM study_sessions WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

export default records

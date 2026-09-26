import { Hono } from 'hono'
import { type Env, body, fail, text } from '../lib/app'
import { MAX_SESSION_SEC, MIN_SESSION_SEC, XP_PER_MINUTE, XP_SESSION_CAP } from '../lib/rules'
import { kstDate } from '../lib/time'
import { grantXp, xpSummary } from '../lib/xp'

const timer = new Hono<Env>()

type Active = {
  id: number
  subject_id: number
  subject: string
  status: 'running' | 'paused'
  started_at: number
  paused_at: number | null
  paused_total_sec: number
  pause_count: number
  start_photo: string | null
  memo: string
}

function findActive(db: D1Database, userId: number) {
  return db
    .prepare(
      `SELECT s.id, s.subject_id, sub.name AS subject, s.status, s.started_at, s.paused_at, s.paused_total_sec, s.pause_count, s.start_photo, s.memo
       FROM study_sessions s JOIN subjects sub ON sub.id = s.subject_id
       WHERE s.user_id = ? AND s.status <> 'done'`
    )
    .bind(userId)
    .first<Active>()
}

// 모든 시간은 서버에 저장된 시각으로 계산한다. 일시정지 중이면 멈춘 시점 이후는 휴식으로 센다.
function times(s: Active, now: number) {
  const totalSec = Math.max(0, Math.floor((now - s.started_at) / 1000))
  // 일시정지 중의 공부시간은 멈춘 시점 기준으로 한 번만 계산한다.
  // (총 경과 − 휴식으로 매번 다시 계산하면 초 단위 내림 때문에 멈춘 숫자가 1초씩 흔들린다)
  const studiedUntil = s.status === 'paused' && s.paused_at ? s.paused_at : now
  const elapsedSec = Math.max(0, Math.floor((studiedUntil - s.started_at) / 1000) - s.paused_total_sec)
  return { totalSec, elapsedSec, pausedSec: Math.max(0, totalSec - elapsedSec) }
}

const view = (s: Active, now: number) => ({
  id: s.id,
  subjectId: s.subject_id,
  subject: s.subject,
  status: s.status,
  startedAt: s.started_at,
  pauseCount: s.pause_count,
  startPhoto: s.start_photo,
  memo: s.memo,
  maxSec: MAX_SESSION_SEC,
  ...times(s, now),
})

// 기록을 확정한다. 공부시간이 8시간을 넘으면 8시간에서 자르고, 종료 시각도 8시간을 채운 순간으로 맞춘다.
async function finalize(db: D1Database, userId: number, s: Active, now: number) {
  const t = times(s, now)
  if (t.elapsedSec < MIN_SESSION_SEC) {
    await db.prepare(`DELETE FROM study_sessions WHERE id = ? AND status <> 'done'`).bind(s.id).run()
    return { discarded: true, durationSec: t.elapsedSec, minSec: MIN_SESSION_SEC }
  }

  const capped = t.elapsedSec >= MAX_SESSION_SEC
  const durationSec = capped ? MAX_SESSION_SEC : t.elapsedSec
  const pausedSec = capped ? s.paused_total_sec : t.pausedSec
  const endedAt = capped ? s.started_at + (MAX_SESSION_SEC + s.paused_total_sec) * 1000 : now

  // status <> 'done' 조건 덕분에 종료 요청이 겹쳐도 한 번만 확정된다
  const result = await db
    .prepare(
      `UPDATE study_sessions
       SET status = 'done', ended_at = ?, duration_sec = ?, paused_total_sec = ?, paused_at = NULL
       WHERE id = ? AND status <> 'done'`
    )
    .bind(endedAt, durationSec, pausedSec, s.id)
    .run()
  if (!result.meta.changes) return null

  const before = await xpSummary(db, userId)
  const xpGained = Math.min(XP_SESSION_CAP, Math.floor(durationSec / 60) * XP_PER_MINUTE)
  await grantXp(db, userId, 'study_session', s.id, xpGained).run()
  const after = await xpSummary(db, userId)

  return {
    record: {
      id: s.id,
      subject: s.subject,
      startedAt: s.started_at,
      endedAt,
      durationSec,
      totalSec: Math.floor((endedAt - s.started_at) / 1000),
      pausedSec,
      pauseCount: s.pause_count,
      memo: s.memo,
    },
    capped,
    maxSec: MAX_SESSION_SEC,
    xpGained,
    leveledUp: after.level > before.level,
    ...after,
  }
}

// 공부시간이 8시간을 넘긴 타이머는 일시정지 중이어도 요청이 오는 그 자리에서 8시간으로 확정한다
async function stopIfOverLimit(db: D1Database, userId: number, now: number) {
  const active = await findActive(db, userId)
  if (!active || times(active, now).elapsedSec < MAX_SESSION_SEC) return null
  return finalize(db, userId, active, now)
}

// 진행 중인 타이머를 돌려준다. 8시간을 넘겼으면 자동 종료하고 결과를 autoStopped로 한 번 알린다.
timer.get('/', async (c) => {
  const user = c.get('user')
  const now = Date.now()
  const autoStopped = await stopIfOverLimit(c.env.DB, user.id, now)
  if (autoStopped) return c.json({ timer: null, autoStopped, now })
  const active = await findActive(c.env.DB, user.id)
  return c.json({ timer: active && view(active, now), now })
})

timer.post('/start', async (c) => {
  const user = c.get('user')
  const data = await body(c)
  const subject = await c.env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ? AND archived = 0')
    .bind(Number(data.subjectId) || 0, user.id)
    .first()
  if (!subject) return fail(c, 400, '과목을 선택해 주세요')
  // 준비 화면의 "오늘의 공부 내용". 회고의 "공부한 내용"과 같은 칸에 미리 넣어 둔다
  const memo = text(data.memo, 1000)
  if (await findActive(c.env.DB, user.id)) return fail(c, 409, '이미 진행 중인 타이머가 있습니다')

  const now = Date.now()
  try {
    await c.env.DB.prepare(
      `INSERT INTO study_sessions (user_id, subject_id, status, started_at, start_date, memo) VALUES (?, ?, 'running', ?, ?, ?)`
    )
      .bind(user.id, subject.id, now, kstDate(now), memo)
      .run()
  } catch {
    // 동시에 두 번 눌린 경우: 부분 UNIQUE 인덱스가 두 번째 시작을 막는다
    return fail(c, 409, '이미 진행 중인 타이머가 있습니다')
  }
  const active = await findActive(c.env.DB, user.id)
  return c.json({ timer: active && view(active, now), now }, 201)
})

timer.post('/pause', async (c) => {
  const now = Date.now()
  const autoStopped = await stopIfOverLimit(c.env.DB, c.get('user').id, now)
  if (autoStopped) return c.json({ timer: null, autoStopped, now })
  await c.env.DB.prepare(
    `UPDATE study_sessions SET status = 'paused', paused_at = ?, pause_count = pause_count + 1 WHERE user_id = ? AND status = 'running'`
  )
    .bind(now, c.get('user').id)
    .run()
  const active = await findActive(c.env.DB, c.get('user').id)
  return active ? c.json({ timer: view(active, now), now }) : fail(c, 409, '진행 중인 타이머가 없습니다')
})

timer.post('/resume', async (c) => {
  const now = Date.now()
  const autoStopped = await stopIfOverLimit(c.env.DB, c.get('user').id, now)
  if (autoStopped) return c.json({ timer: null, autoStopped, now })
  await c.env.DB.prepare(
    `UPDATE study_sessions
     SET status = 'running', paused_total_sec = paused_total_sec + CAST((? - paused_at) / 1000 AS INTEGER), paused_at = NULL
     WHERE user_id = ? AND status = 'paused'`
  )
    .bind(now, c.get('user').id)
    .run()
  const active = await findActive(c.env.DB, c.get('user').id)
  return active ? c.json({ timer: view(active, now), now }) : fail(c, 409, '진행 중인 타이머가 없습니다')
})

// 종료 시점에 공부시간을 확정한다. 회고는 이후 PATCH /api/records/:id 로 저장한다.
timer.post('/stop', async (c) => {
  const user = c.get('user')
  const active = await findActive(c.env.DB, user.id)
  if (!active) return fail(c, 409, '진행 중인 타이머가 없습니다')
  const result = await finalize(c.env.DB, user.id, active, Date.now())
  return result ? c.json(result) : fail(c, 409, '진행 중인 타이머가 없습니다')
})

export default timer

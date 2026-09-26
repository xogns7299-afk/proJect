import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { type Ctx, type Env, body, fail, idParam, text } from '../lib/app'
import { MAX_SESSION_SEC, levelOf } from '../lib/rules'
import { addDays, badDate, isDate, kstDate, weekStart } from '../lib/time'

const studies = new Hono<Env>()

// 헷갈리는 글자(0/O, 1/I)를 뺀 초대 코드
function inviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => chars[b % chars.length]).join('')
}

// 스터디 하위 경로는 모두 멤버만 접근할 수 있다. 화면에서 숨기는 것과 별개로 서버에서 막는다.
const requireMember = createMiddleware<Env>(async (c, next) => {
  const row = await c.env.DB.prepare('SELECT role FROM study_members WHERE study_id = ? AND user_id = ?')
    .bind(idParam(c), c.get('user').id)
    .first<{ role: 'owner' | 'member' }>()
  if (!row) return fail(c, 404, '스터디를 찾을 수 없습니다')
  c.set('role', row.role)
  await next()
})

// 이 스터디 피드에 보이는 기록인지: 완료된 기록이고, 기록 주인이 이 스터디 멤버여야 한다
function findFeedRecord(c: Ctx) {
  return c.env.DB.prepare(
    `SELECT s.id, s.user_id AS userId FROM study_sessions s
     JOIN study_members m ON m.user_id = s.user_id AND m.study_id = ?
     WHERE s.id = ? AND s.status = 'done'`
  )
    .bind(idParam(c), idParam(c, 'recordId'))
    .first<{ id: number; userId: number }>()
}

studies.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.description, m.role,
            (SELECT COUNT(*) FROM study_members WHERE study_id = s.id) AS memberCount
     FROM studies s JOIN study_members m ON m.study_id = s.id AND m.user_id = ?
     ORDER BY m.joined_at`
  )
    .bind(c.get('user').id)
    .all()
  return c.json(results)
})

studies.post('/', async (c) => {
  const user = c.get('user')
  const data = await body(c)
  const name = text(data.name, 30)
  if (!name) return fail(c, 400, '스터디 이름을 입력해 주세요')
  const code = inviteCode()
  const now = Date.now()
  const result = await c.env.DB.prepare('INSERT INTO studies (name, description, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(name, text(data.description, 200), user.id, code, now)
    .run()
  const id = result.meta.last_row_id
  await c.env.DB.prepare(`INSERT INTO study_members (study_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`).bind(id, user.id, now).run()
  return c.json({ id, name, inviteCode: code }, 201)
})

studies.post('/join', async (c) => {
  const code = text((await body(c)).inviteCode, 8).toUpperCase()
  const study = await c.env.DB.prepare('SELECT id, name FROM studies WHERE invite_code = ?').bind(code).first<{ id: number; name: string }>()
  if (!study) return fail(c, 404, '초대 코드를 다시 확인해 주세요')
  await c.env.DB.prepare(`INSERT OR IGNORE INTO study_members (study_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`)
    .bind(study.id, c.get('user').id, Date.now())
    .run()
  return c.json(study)
})

// 스터디 홈: 기본 정보 + 멤버별 이번 주 현황
studies.get('/:id', requireMember, async (c) => {
  const id = idParam(c)
  const monday = weekStart(kstDate())
  const [study, members] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, name, description, invite_code AS inviteCode FROM studies WHERE id = ?').bind(id),
    c.env.DB.prepare(
      `SELECT u.id, u.nickname, u.character_id AS characterId, m.role,
              (SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE user_id = u.id) AS xp,
              (SELECT COALESCE(SUM(duration_sec), 0) FROM study_sessions
                WHERE user_id = u.id AND status = 'done' AND start_date BETWEEN ?2 AND ?3) AS weekSec,
              (SELECT COUNT(*) FROM weekly_goal_items WHERE user_id = u.id AND week_start = ?2) AS goalTotal,
              (SELECT COUNT(*) FROM weekly_goal_items WHERE user_id = u.id AND week_start = ?2 AND done = 1) AS goalDone,
              (SELECT sub.name FROM study_sessions ss JOIN subjects sub ON sub.id = ss.subject_id
                WHERE ss.user_id = u.id AND ss.status = 'running'
                  AND (?4 - ss.started_at) / 1000 - ss.paused_total_sec < ?5) AS studyingSubject
       FROM study_members m JOIN users u ON u.id = m.user_id
       WHERE m.study_id = ?1 ORDER BY weekSec DESC, m.joined_at`
    ).bind(id, monday, addDays(monday, 6), Date.now(), MAX_SESSION_SEC),
  ])
  return c.json({
    ...(study.results[0] as object),
    role: c.get('role'),
    myId: c.get('user').id,
    weekStart: monday,
    members: (members.results as Record<string, number>[]).map((m) => ({
      ...m,
      level: levelOf(m.xp).level,
      studying: m.studyingSubject !== null,
      achievement: m.goalTotal ? Math.round((m.goalDone / m.goalTotal) * 100) : 0,
    })),
  })
})

// 피드: 멤버들의 공부 기록. 복사본 없이 원본을 조회하므로 여러 스터디에 가입해도 개인 누적이 중복되지 않는다.
studies.get('/:id/feed', requireMember, async (c) => {
  const id = idParam(c)
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, u.id AS userId, u.nickname, u.character_id AS characterId,
            (SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE user_id = u.id) AS xp,
            sub.name AS subject, s.started_at AS startedAt, s.start_date AS date, s.duration_sec AS durationSec, s.memo,
            s.start_photo AS startPhoto, s.end_photo AS endPhoto,
            (SELECT COUNT(*) FROM record_cheers WHERE study_id = ?1 AND session_id = s.id) AS cheerCount,
            EXISTS (SELECT 1 FROM record_cheers WHERE study_id = ?1 AND session_id = s.id AND user_id = ?2) AS cheered,
            (SELECT COUNT(*) FROM record_comments WHERE study_id = ?1 AND session_id = s.id) AS commentCount
     FROM study_sessions s
     JOIN study_members m ON m.user_id = s.user_id AND m.study_id = ?1
     JOIN users u ON u.id = s.user_id
     JOIN subjects sub ON sub.id = s.subject_id
     WHERE s.status = 'done' ORDER BY s.started_at DESC LIMIT 50`
  )
    .bind(id, c.get('user').id)
    .all<Record<string, number>>()
  return c.json(results.map((r) => ({ ...r, level: levelOf(r.xp).level, cheered: Boolean(r.cheered) })))
})

// 응원은 누를 때마다 켜졌다 꺼진다. 자기 기록은 응원할 수 없다.
studies.post('/:id/feed/:recordId/cheer', requireMember, async (c) => {
  const record = await findFeedRecord(c)
  if (!record) return fail(c, 404, '기록을 찾을 수 없습니다')
  const studyId = idParam(c)
  const userId = c.get('user').id
  if (record.userId === userId) return fail(c, 400, '내 기록은 응원할 수 없습니다')

  const removed = await c.env.DB.prepare('DELETE FROM record_cheers WHERE study_id = ? AND session_id = ? AND user_id = ?')
    .bind(studyId, record.id, userId)
    .run()
  if (!removed.meta.changes) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO record_cheers (study_id, session_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(studyId, record.id, userId, Date.now())
      .run()
  }
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM record_cheers WHERE study_id = ? AND session_id = ?')
    .bind(studyId, record.id)
    .first<{ n: number }>()
  return c.json({ cheered: !removed.meta.changes, cheerCount: count?.n ?? 0 })
})

studies.get('/:id/feed/:recordId/comments', requireMember, async (c) => {
  const record = await findFeedRecord(c)
  if (!record) return fail(c, 404, '기록을 찾을 수 없습니다')
  const { results } = await c.env.DB.prepare(
    `SELECT cm.id, cm.user_id AS userId, u.nickname, u.character_id AS characterId, cm.body, cm.created_at AS createdAt
     FROM record_comments cm JOIN users u ON u.id = cm.user_id
     WHERE cm.study_id = ? AND cm.session_id = ? ORDER BY cm.id`
  )
    .bind(idParam(c), record.id)
    .all()
  return c.json(results)
})

studies.post('/:id/feed/:recordId/comments', requireMember, async (c) => {
  const record = await findFeedRecord(c)
  if (!record) return fail(c, 404, '기록을 찾을 수 없습니다')
  const comment = text((await body(c)).body, 300)
  if (!comment) return fail(c, 400, '댓글을 입력해 주세요')
  const user = c.get('user')
  const now = Date.now()
  const result = await c.env.DB.prepare('INSERT INTO record_comments (study_id, session_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(idParam(c), record.id, user.id, comment, now)
    .run()
  return c.json(
    { id: result.meta.last_row_id, userId: user.id, nickname: user.nickname, characterId: user.character_id, body: comment, createdAt: now },
    201
  )
})

// 댓글은 쓴 사람만 지울 수 있다
studies.delete('/:id/comments/:commentId', requireMember, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM record_comments WHERE id = ? AND study_id = ? AND user_id = ?')
    .bind(idParam(c, 'commentId'), idParam(c), c.get('user').id)
    .run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '댓글을 찾을 수 없습니다')
})

// 멤버 한 명의 이번 주 목표
studies.get('/:id/members/:userId/goals', requireMember, async (c) => {
  if (badDate(c.req.query('week'))) return fail(c, 400, '날짜가 올바르지 않습니다')
  const week = weekStart(isDate(c.req.query('week')) ? c.req.query('week') : undefined)
  const { results } = await c.env.DB.prepare(
    `SELECT g.id, g.title, g.done FROM weekly_goal_items g
     JOIN study_members m ON m.user_id = g.user_id AND m.study_id = ?
     WHERE g.user_id = ? AND g.week_start = ? ORDER BY g.id`
  )
    .bind(idParam(c), idParam(c, 'userId'), week)
    .all()
  return c.json({ weekStart: week, items: results })
})

// 탈퇴해도 내 개인 기록은 그대로다. 스터디장은 탈퇴 대신 스터디를 삭제한다.
studies.post('/:id/leave', requireMember, async (c) => {
  if (c.get('role') === 'owner') return fail(c, 400, '스터디장은 나갈 수 없습니다. 스터디를 삭제해 주세요')
  await c.env.DB.prepare('DELETE FROM study_members WHERE study_id = ? AND user_id = ?').bind(idParam(c), c.get('user').id).run()
  return c.json({ ok: true })
})

studies.delete('/:id', requireMember, async (c) => {
  if (c.get('role') !== 'owner') return fail(c, 403, '스터디장만 할 수 있습니다')
  await c.env.DB.prepare('DELETE FROM studies WHERE id = ?').bind(idParam(c)).run()
  return c.json({ ok: true })
})

export default studies

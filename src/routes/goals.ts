import { Hono } from 'hono'
import { type Env, body, fail, idParam, text } from '../lib/app'
import { XP_GOAL_ITEM } from '../lib/rules'
import { isDate, weekStart } from '../lib/time'
import { grantXp, revokeXp, xpSummary } from '../lib/xp'

const goals = new Hono<Env>()

// week를 생략하면 이번 주. 어떤 날짜를 주든 그 주의 월요일로 맞춘다.
const weekOf = (v: unknown) => weekStart(isDate(v) ? v : undefined)
// 지난 주 목표는 보기만 한다. 체크를 바꾸면 이미 끝난 주의 경험치가 흔들리기 때문이다.
const PAST_WEEK = '지난 주 목표는 바꿀 수 없습니다'

goals.get('/', async (c) => {
  const week = weekOf(c.req.query('week'))
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, done FROM weekly_goal_items WHERE user_id = ? AND week_start = ? ORDER BY id'
  )
    .bind(c.get('user').id, week)
    .all<{ id: number; title: string; done: number }>()
  const doneCount = results.filter((g) => g.done).length
  return c.json({
    weekStart: week,
    items: results,
    achievement: results.length ? Math.round((doneCount / results.length) * 100) : 0,
  })
})

goals.post('/', async (c) => {
  const data = await body(c)
  const title = text(data.title, 100)
  if (!title) return fail(c, 400, '목표를 입력해 주세요')
  const week = weekOf(data.week)
  if (week < weekStart()) return fail(c, 400, PAST_WEEK)
  const result = await c.env.DB.prepare('INSERT INTO weekly_goal_items (user_id, week_start, title) VALUES (?, ?, ?)')
    .bind(c.get('user').id, week, title)
    .run()
  return c.json({ id: result.meta.last_row_id, title, done: 0, weekStart: week }, 201)
})

goals.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = idParam(c)
  const data = await body(c)
  const item = await c.env.DB.prepare('SELECT done, week_start FROM weekly_goal_items WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<{ done: number; week_start: string }>()
  if (!item) return fail(c, 404, '목표를 찾을 수 없습니다')
  if (item.week_start < weekStart()) return fail(c, 400, PAST_WEEK)

  const title = data.title === undefined ? null : text(data.title, 100)
  if (title === '') return fail(c, 400, '목표를 입력해 주세요')
  const done = data.done === undefined ? item.done : data.done ? 1 : 0

  const statements = [
    c.env.DB.prepare('UPDATE weekly_goal_items SET title = COALESCE(?, title), done = ?, done_at = ? WHERE id = ?').bind(
      title,
      done,
      done ? Date.now() : null,
      id
    ),
  ]
  // 완료하면 경험치 지급, 체크를 해제하면 회수
  if (done && !item.done) statements.push(grantXp(c.env.DB, user.id, 'weekly_goal', id, XP_GOAL_ITEM))
  if (!done && item.done) statements.push(revokeXp(c.env.DB, 'weekly_goal', id))
  await c.env.DB.batch(statements)
  return c.json({ ok: true, ...(await xpSummary(c.env.DB, user.id)) })
})

goals.delete('/:id', async (c) => {
  const id = idParam(c)
  const item = await c.env.DB.prepare('SELECT week_start FROM weekly_goal_items WHERE id = ? AND user_id = ?')
    .bind(id, c.get('user').id)
    .first<{ week_start: string }>()
  if (!item) return fail(c, 404, '목표를 찾을 수 없습니다')
  if (item.week_start < weekStart()) return fail(c, 400, PAST_WEEK)
  await c.env.DB.batch([revokeXp(c.env.DB, 'weekly_goal', id), c.env.DB.prepare('DELETE FROM weekly_goal_items WHERE id = ?').bind(id)])
  return c.json({ ok: true })
})

export default goals

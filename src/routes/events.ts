import { Hono } from 'hono'
import { type Ctx, type Env, body, fail, idParam, text } from '../lib/app'
import { isDate, isTime } from '../lib/time'

const events = new Hono<Env>()

async function readEvent(c: Ctx) {
  const data = await body(c)
  const title = text(data.title, 100)
  if (!title) return '일정 제목을 입력해 주세요'
  if (!isDate(data.date)) return '날짜를 선택해 주세요'
  const startTime = isTime(data.startTime) ? data.startTime : null
  const endTime = isTime(data.endTime) ? data.endTime : null
  if (startTime && endTime && endTime < startTime) return '종료 시각이 시작 시각보다 빨라요'
  return { title, date: data.date, startTime, endTime, memo: text(data.memo, 500) }
}

// 캘린더 한 달치. 개인 일정은 본인만 본다.
events.get('/', async (c) => {
  const month = c.req.query('month') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month)) return fail(c, 400, 'month는 YYYY-MM 형식이어야 합니다')
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, date, start_time AS startTime, end_time AS endTime, memo
     FROM events WHERE user_id = ? AND date LIKE ? ORDER BY date, start_time IS NULL, start_time`
  )
    .bind(c.get('user').id, month + '-%')
    .all()
  return c.json(results)
})

events.post('/', async (c) => {
  const e = await readEvent(c)
  if (typeof e === 'string') return fail(c, 400, e)
  const result = await c.env.DB.prepare('INSERT INTO events (user_id, title, date, start_time, end_time, memo) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(c.get('user').id, e.title, e.date, e.startTime, e.endTime, e.memo)
    .run()
  return c.json({ id: result.meta.last_row_id, ...e }, 201)
})

events.put('/:id', async (c) => {
  const e = await readEvent(c)
  if (typeof e === 'string') return fail(c, 400, e)
  const result = await c.env.DB.prepare(
    'UPDATE events SET title = ?, date = ?, start_time = ?, end_time = ?, memo = ? WHERE id = ? AND user_id = ?'
  )
    .bind(e.title, e.date, e.startTime, e.endTime, e.memo, idParam(c), c.get('user').id)
    .run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '일정을 찾을 수 없습니다')
})

events.delete('/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').bind(idParam(c), c.get('user').id).run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '일정을 찾을 수 없습니다')
})

export default events

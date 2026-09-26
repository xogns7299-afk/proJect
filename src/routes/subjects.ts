import { Hono } from 'hono'
import { type Env, body, fail, idParam, text } from '../lib/app'

const subjects = new Hono<Env>()

const COLOR = /^#[0-9a-fA-F]{6}$/

subjects.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, color FROM subjects WHERE user_id = ? AND archived = 0 ORDER BY created_at'
  )
    .bind(c.get('user').id)
    .all()
  return c.json(results)
})

subjects.post('/', async (c) => {
  const data = await body(c)
  const name = text(data.name, 20)
  const color = COLOR.test(String(data.color)) ? String(data.color) : '#4f6ef7'
  if (!name) return fail(c, 400, '과목 이름을 입력해 주세요')
  const result = await c.env.DB.prepare('INSERT INTO subjects (user_id, name, color, created_at) VALUES (?, ?, ?, ?)')
    .bind(c.get('user').id, name, color, Date.now())
    .run()
  return c.json({ id: result.meta.last_row_id, name, color }, 201)
})

subjects.patch('/:id', async (c) => {
  const data = await body(c)
  const name = text(data.name, 20)
  if (!name) return fail(c, 400, '과목 이름을 입력해 주세요')
  const color = COLOR.test(String(data.color)) ? String(data.color) : null
  const result = await c.env.DB.prepare('UPDATE subjects SET name = ?, color = COALESCE(?, color) WHERE id = ? AND user_id = ?')
    .bind(name, color, idParam(c), c.get('user').id)
    .run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '과목을 찾을 수 없습니다')
})

// 과거 기록이 과목을 참조하므로 실제로 지우지 않고 숨긴다
subjects.delete('/:id', async (c) => {
  const result = await c.env.DB.prepare('UPDATE subjects SET archived = 1 WHERE id = ? AND user_id = ?')
    .bind(idParam(c), c.get('user').id)
    .run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '과목을 찾을 수 없습니다')
})

export default subjects

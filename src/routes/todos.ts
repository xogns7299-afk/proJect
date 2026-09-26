import { Hono } from 'hono'
import { type Env, body, fail, idParam, text } from '../lib/app'

const todos = new Hono<Env>()

todos.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, done, done_at AS doneAt, created_at AS createdAt FROM todos WHERE user_id = ? ORDER BY created_at DESC, id DESC'
  )
    .bind(c.get('user').id)
    .all()
  return c.json(results)
})

todos.post('/', async (c) => {
  const title = text((await body(c)).title, 80)
  if (!title) return fail(c, 400, '할 일을 입력해 주세요')
  const result = await c.env.DB.prepare('INSERT INTO todos (user_id, title, created_at) VALUES (?, ?, ?)')
    .bind(c.get('user').id, title, Date.now())
    .run()
  return c.json({ id: result.meta.last_row_id, title, done: 0 }, 201)
})

todos.patch('/:id', async (c) => {
  const data = await body(c)
  const title = data.title === undefined ? null : text(data.title, 80)
  if (title === '') return fail(c, 400, '할 일을 입력해 주세요')
  const done = data.done === undefined ? null : data.done ? 1 : 0
  const result = await c.env.DB.prepare(
    `UPDATE todos
     SET title = COALESCE(?1, title),
         done = COALESCE(?2, done),
         done_at = CASE WHEN ?2 IS NULL THEN done_at WHEN ?2 = 1 THEN ?3 ELSE NULL END
     WHERE id = ?4 AND user_id = ?5`
  )
    .bind(title, done, Date.now(), idParam(c), c.get('user').id)
    .run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '할 일을 찾을 수 없습니다')
})

todos.delete('/done', async (c) => {
  await c.env.DB.prepare('DELETE FROM todos WHERE user_id = ? AND done = 1').bind(c.get('user').id).run()
  return c.json({ ok: true })
})

todos.delete('/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').bind(idParam(c), c.get('user').id).run()
  return result.meta.changes ? c.json({ ok: true }) : fail(c, 404, '할 일을 찾을 수 없습니다')
})

export default todos

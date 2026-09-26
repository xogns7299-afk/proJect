import { Hono } from 'hono'
import type { Env } from './lib/app'
import { requireAuth } from './lib/auth'
import { renderer } from './renderer'
import auth from './routes/auth'
import events from './routes/events'
import goals from './routes/goals'
import photos from './routes/photos'
import records from './routes/records'
import studies from './routes/studies'
import subjects from './routes/subjects'
import timer from './routes/timer'
import todos from './routes/todos'

const app = new Hono<Env>()

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))

app.route('/api/auth', auth)

// 아래 API는 모두 로그인이 필요하다
for (const path of ['subjects', 'timer', 'records', 'todos', 'events', 'goals', 'studies', 'photos']) {
  app.use(`/api/${path}/*`, requireAuth)
  app.use(`/api/${path}`, requireAuth)
}
app.route('/api/subjects', subjects)
app.route('/api/timer', timer)
app.route('/api/records', records)
app.route('/api', photos)
app.route('/api/todos', todos)
app.route('/api/events', events)
app.route('/api/goals', goals)
app.route('/api/studies', studies)

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: '없는 주소입니다' }, 404) : c.redirect('/')))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: '서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요' }, 500)
})

// 화면은 한 페이지이고, 화면 전환은 브라우저의 JS(public/static/js)가 맡는다
app.get('/', renderer, (c) => c.render(<div id="app"></div>))

export default app

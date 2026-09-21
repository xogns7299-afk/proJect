import { Hono } from 'hono'
import { renderer } from './renderer'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <main>
      <h1>프로젝트 준비 완료</h1>
      <p>아이디어가 확정되면 이 화면이 실제 서비스로 바뀝니다.</p>
      <p id="status">서버 확인 중…</p>
    </main>
  )
})

app.get('/api/health', (c) => {
  return c.json({ ok: true, time: new Date().toISOString() })
})

export default app

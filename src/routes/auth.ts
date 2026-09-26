import { Hono } from 'hono'
import { type Env, body, fail, text } from '../lib/app'
import { endSession, hashPassword, requireAuth, startSession, verifyPassword } from '../lib/auth'
import { xpSummary } from '../lib/xp'

const auth = new Hono<Env>()

const LOGIN_ID = /^[a-z0-9_]{4,20}$/
const CHARACTER_ID = /^[a-z0-9_-]{1,20}$/

auth.post('/signup', async (c) => {
  const data = await body(c)
  const loginId = text(data.loginId, 20).toLowerCase()
  const password = typeof data.password === 'string' ? data.password : ''
  const nickname = text(data.nickname, 12)
  const characterId = text(data.characterId, 20)

  if (!LOGIN_ID.test(loginId)) return fail(c, 400, '아이디는 영문 소문자·숫자·밑줄 4~20자로 입력해 주세요')
  if (password.length < 8 || password.length > 72) return fail(c, 400, '비밀번호는 8자 이상이어야 합니다')
  if (!nickname) return fail(c, 400, '닉네임을 입력해 주세요')
  if (!CHARACTER_ID.test(characterId)) return fail(c, 400, '캐릭터를 선택해 주세요')

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE login_id = ?').bind(loginId).first()
  if (exists) return fail(c, 409, '이미 사용 중인 아이디입니다')

  const result = await c.env.DB.prepare(
    'INSERT INTO users (login_id, password_hash, nickname, character_id, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(loginId, await hashPassword(password), nickname, characterId, Date.now())
    .run()
  await startSession(c, result.meta.last_row_id)
  return c.json({ ok: true }, 201)
})

auth.post('/login', async (c) => {
  const data = await body(c)
  const loginId = text(data.loginId, 20).toLowerCase()
  const password = typeof data.password === 'string' ? data.password : ''
  const row = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE login_id = ?')
    .bind(loginId)
    .first<{ id: number; password_hash: string }>()
  // 아이디가 없을 때와 비밀번호가 틀렸을 때를 구분해서 알려주지 않는다
  if (!row || !(await verifyPassword(password, row.password_hash))) return fail(c, 401, '아이디 또는 비밀번호가 맞지 않습니다')
  await startSession(c, row.id)
  return c.json({ ok: true })
})

auth.post('/logout', async (c) => {
  await endSession(c)
  return c.json({ ok: true })
})

auth.get('/me', requireAuth, async (c) => {
  const user = c.get('user')
  return c.json({
    id: user.id,
    loginId: user.login_id,
    nickname: user.nickname,
    characterId: user.character_id,
    ...(await xpSummary(c.env.DB, user.id)),
  })
})

auth.patch('/me', requireAuth, async (c) => {
  const user = c.get('user')
  const data = await body(c)
  const nickname = data.nickname === undefined ? user.nickname : text(data.nickname, 12)
  const characterId = data.characterId === undefined ? user.character_id : text(data.characterId, 20)
  if (!nickname) return fail(c, 400, '닉네임을 입력해 주세요')
  if (!CHARACTER_ID.test(characterId)) return fail(c, 400, '캐릭터를 선택해 주세요')
  await c.env.DB.prepare('UPDATE users SET nickname = ?, character_id = ? WHERE id = ?').bind(nickname, characterId, user.id).run()
  return c.json({ ok: true })
})

export default auth

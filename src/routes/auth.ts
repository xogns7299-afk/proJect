import { Hono } from 'hono'
import { type Env, body, fail, text } from '../lib/app'
import { endSession, hashPassword, newRecoveryCode, normalizeCode, passwordProblem, requireAuth, startSession, verifyPassword } from '../lib/auth'
import { STAGE_UNLOCK_LEVELS } from '../lib/rules'
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
  if (passwordProblem(password)) return fail(c, 400, passwordProblem(password))
  if (!nickname) return fail(c, 400, '닉네임을 입력해 주세요')
  if (!CHARACTER_ID.test(characterId)) return fail(c, 400, '캐릭터를 선택해 주세요')

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE login_id = ?').bind(loginId).first()
  if (exists) return fail(c, 409, '이미 사용 중인 아이디입니다')

  // 비밀번호를 잊었을 때 쓸 복구 코드. 이 응답에서 한 번만 보여 준다
  const recoveryCode = newRecoveryCode()
  const result = await c.env.DB.prepare(
    'INSERT INTO users (login_id, password_hash, nickname, character_id, created_at, recovery_hash) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(loginId, await hashPassword(password), nickname, characterId, Date.now(), await hashPassword(normalizeCode(recoveryCode)))
    .run()
  await startSession(c, result.meta.last_row_id)
  return c.json({ ok: true, recoveryCode }, 201)
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

// 비밀번호 찾기: 아이디 + 복구 코드로 새 비밀번호를 정한다. 성공하면 다른 기기 로그인은 풀리고,
// 쓴 복구 코드는 버리고 새 코드를 발급한다(한 번만 보여 줌). 복구 코드를 5번 틀리면 15분 잠근다.
const RECOVERY_MAX_FAILS = 5
const RECOVERY_LOCK_MS = 15 * 60 * 1000
auth.post('/reset-password', async (c) => {
  const data = await body(c)
  const loginId = text(data.loginId, 20).toLowerCase()
  const code = normalizeCode(data.recoveryCode)
  const password = typeof data.newPassword === 'string' ? data.newPassword : ''
  if (passwordProblem(password)) return fail(c, 400, passwordProblem(password))

  const row = await c.env.DB.prepare('SELECT id, recovery_hash, recovery_fails, recovery_locked_until FROM users WHERE login_id = ?')
    .bind(loginId)
    .first<{ id: number; recovery_hash: string | null; recovery_fails: number; recovery_locked_until: number | null }>()
  const now = Date.now()
  if (row?.recovery_locked_until && row.recovery_locked_until > now) {
    return fail(c, 429, `복구 코드를 여러 번 틀렸어요. ${Math.ceil((row.recovery_locked_until - now) / 60000)}분 뒤에 다시 시도해 주세요`)
  }
  // 아이디가 없을 때와 코드가 틀렸을 때를 구분해서 알려주지 않는다
  const ok = !!row?.recovery_hash && code.length === 8 && (await verifyPassword(code, row.recovery_hash))
  if (!ok) {
    if (row) {
      const fails = row.recovery_fails + 1
      await c.env.DB.prepare('UPDATE users SET recovery_fails = ?, recovery_locked_until = ? WHERE id = ?')
        .bind(fails >= RECOVERY_MAX_FAILS ? 0 : fails, fails >= RECOVERY_MAX_FAILS ? now + RECOVERY_LOCK_MS : null, row.id)
        .run()
    }
    return fail(c, 401, '아이디 또는 복구 코드가 맞지 않습니다')
  }

  const recoveryCode = newRecoveryCode()
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, recovery_hash = ?, recovery_fails = 0, recovery_locked_until = NULL WHERE id = ?').bind(
      await hashPassword(password),
      await hashPassword(normalizeCode(recoveryCode)),
      row!.id
    ),
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(row!.id),
  ])
  await startSession(c, row!.id)
  return c.json({ ok: true, recoveryCode })
})

// 비밀번호 변경 (내 정보). 현재 비밀번호를 확인하고, 지금 기기 말고 다른 기기 로그인은 풀린다.
auth.post('/password', requireAuth, async (c) => {
  const user = c.get('user')
  const data = await body(c)
  const current = typeof data.currentPassword === 'string' ? data.currentPassword : ''
  const next = typeof data.newPassword === 'string' ? data.newPassword : ''
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(current, row.password_hash))) return fail(c, 400, '현재 비밀번호가 맞지 않습니다')
  if (passwordProblem(next)) return fail(c, 400, passwordProblem(next))
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), user.id),
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(user.id),
  ])
  await startSession(c, user.id)
  return c.json({ ok: true })
})

// 복구 코드 새로 받기 (내 정보). 예전 코드는 더 이상 쓸 수 없다. 현재 비밀번호를 확인한다.
auth.post('/recovery-code', requireAuth, async (c) => {
  const user = c.get('user')
  const data = await body(c)
  const current = typeof data.currentPassword === 'string' ? data.currentPassword : ''
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(current, row.password_hash))) return fail(c, 400, '현재 비밀번호가 맞지 않습니다')
  const recoveryCode = newRecoveryCode()
  await c.env.DB.prepare('UPDATE users SET recovery_hash = ?, recovery_fails = 0, recovery_locked_until = NULL WHERE id = ?')
    .bind(await hashPassword(normalizeCode(recoveryCode)), user.id)
    .run()
  return c.json({ ok: true, recoveryCode })
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
    displayStage: user.display_stage, // null = 자동(열린 것 중 가장 최근 모습)
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
  // 표시 모습: 보내지 않으면 그대로, null·0이면 자동, 1~3이면 이미 열린 단계만
  let displayStage = user.display_stage
  if (data.displayStage !== undefined) {
    displayStage = data.displayStage ? Number(data.displayStage) : null
    if (displayStage !== null) {
      if (![1, 2, 3].includes(displayStage)) return fail(c, 400, '표시 모습을 다시 골라 주세요')
      const { level } = await xpSummary(c.env.DB, user.id)
      if (level < STAGE_UNLOCK_LEVELS[displayStage - 1]) return fail(c, 400, '아직 열리지 않은 모습이에요')
    }
  }
  await c.env.DB.prepare('UPDATE users SET nickname = ?, character_id = ?, display_stage = ? WHERE id = ?')
    .bind(nickname, characterId, displayStage, user.id)
    .run()
  return c.json({ ok: true })
})

export default auth

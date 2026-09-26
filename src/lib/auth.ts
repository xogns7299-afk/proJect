import { createMiddleware } from 'hono/factory'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { type Ctx, type Env, type User, fail } from './app'

const COOKIE = 'session'
const SESSION_DAYS = 30
// Cloudflare Workers의 PBKDF2 반복 횟수 상한이 100,000이다
const PBKDF2_ITERATIONS = 100_000

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const expected = fromB64(hash)
  const actual = new Uint8Array(await pbkdf2(password, fromB64(salt), Number(iterations)))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

// 비밀번호 규칙: 8~72자, 한글 없이 (한/영 전환을 잊고 한글로 저장돼 로그인을 못 하는 일을 막는다)
export function passwordProblem(password: string) {
  if (password.length < 8 || password.length > 72) return '비밀번호는 8자 이상이어야 합니다'
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(password)) return '비밀번호에 한글이 들어갔어요. 한/영 전환을 확인해 주세요'
  return ''
}

// 복구 코드: 헷갈리는 글자(0·O·1·I·L)를 뺀 32글자 중 8자리 (XXXX-XXXX). 비밀번호처럼 해시로만 저장한다.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const code = [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
  return `${code.slice(0, 4)}-${code.slice(4)}`
}
// 입력한 코드는 대소문자·하이픈·공백을 무시하고 비교한다
export const normalizeCode = (code: unknown) => (typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '')

async function sha256(value: string) {
  return toB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

// 세션 토큰은 쿠키에만 있고, DB에는 해시만 저장한다 (DB가 유출돼도 토큰을 쓸 수 없게)
export async function startSession(c: Ctx, userId: number) {
  const token = toB64(crypto.getRandomValues(new Uint8Array(32)))
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  await c.env.DB.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expiresAt)
    .run()
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function endSession(c: Ctx) {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  deleteCookie(c, COOKIE, { path: '/' })
}

export async function currentUser(c: Ctx) {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  return c.env.DB.prepare(
    `SELECT u.id, u.login_id, u.nickname, u.character_id, u.display_stage
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(await sha256(token), Date.now())
    .first<User>()
}

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const user = await currentUser(c)
  if (!user) return fail(c, 401, '로그인이 필요합니다')
  c.set('user', user)
  await next()
})

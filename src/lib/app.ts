import type { Context } from 'hono'

export type User = {
  id: number
  login_id: string
  nickname: string
  character_id: string
}

export type Env = {
  Bindings: { DB: D1Database; PHOTOS: R2Bucket }
  Variables: { user: User; role: 'owner' | 'member' }
}

export type Ctx = Context<Env>

export const fail = (c: Ctx, status: 400 | 401 | 403 | 404 | 409, message: string) =>
  c.json({ error: message }, status)

// JSON 본문이 없거나 깨져 있어도 빈 객체로 받는다
export async function body(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const data = await c.req.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function text(v: unknown, max: number) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function idParam(c: Ctx, name = 'id') {
  const n = Number(c.req.param(name))
  return Number.isInteger(n) && n > 0 ? n : 0
}

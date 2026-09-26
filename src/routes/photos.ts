import { Hono } from 'hono'
import { type Env, fail, idParam } from '../lib/app'

const photos = new Hono<Env>()

const MAX_BYTES = 3 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// 오공시(start)·오공완(end) 사진 업로드. 내 기록(진행 중·완료 모두)에만 붙일 수 있다.
photos.post('/records/:id/photo', async (c) => {
  const user = c.get('user')
  const id = idParam(c)
  const owned = await c.env.DB.prepare('SELECT 1 FROM study_sessions WHERE id = ? AND user_id = ?').bind(id, user.id).first()
  if (!owned) return fail(c, 404, '기록을 찾을 수 없습니다')

  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  const kind = form?.get('kind') === 'start' ? 'start' : 'end'
  if (!(file instanceof File) || !file.size) return fail(c, 400, '사진을 선택해 주세요')
  if (!TYPES[file.type]) return fail(c, 400, 'JPG, PNG, WEBP 사진만 올릴 수 있습니다')
  if (file.size > MAX_BYTES) return fail(c, 400, '사진은 3MB 이하로 올려 주세요')

  const key = `u${user.id}/r${id}_${kind}_${Date.now()}.${TYPES[file.type]}`
  await c.env.PHOTOS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  await c.env.DB.prepare(`UPDATE study_sessions SET ${kind === 'start' ? 'start_photo' : 'end_photo'} = ? WHERE id = ?`).bind(key, id).run()
  return c.json({ key, url: `/api/photos/${key}` }, 201)
})

// 사진 보기: 기록 주인이거나 같은 스터디 멤버만. 키 앞의 u<id>로 주인을 찾는다.
photos.get('/photos/*', async (c) => {
  const key = c.req.path.replace(/^\/api\/photos\//, '')
  const ownerId = Number(/^u(\d+)\//.exec(key)?.[1])
  if (!ownerId) return fail(c, 404, '사진을 찾을 수 없습니다')
  const me = c.get('user').id
  if (ownerId !== me) {
    const shared = await c.env.DB.prepare(
      'SELECT 1 FROM study_members a JOIN study_members b ON a.study_id = b.study_id WHERE a.user_id = ? AND b.user_id = ?'
    ).bind(ownerId, me).first()
    if (!shared) return fail(c, 404, '사진을 찾을 수 없습니다')
  }
  const obj = await c.env.PHOTOS.get(key)
  if (!obj) return fail(c, 404, '사진을 찾을 수 없습니다')
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'private, max-age=86400' },
  })
})

export default photos

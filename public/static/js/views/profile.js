import { api } from '../api.js'
import { CHARACTERS, avatarOf } from '../characters.js'
import { $, $$, esc, fmtDuration } from '../dom.js'
import { onSubmit, openModal } from '../ui.js'

// 내 정보: 닉네임·캐릭터 바꾸기, 로그아웃. 캐릭터를 바꿔도 레벨·경험치는 그대로다.
export async function openProfile(ctx, logout) {
  const me = ctx.me
  let characterId = me.characterId
  const stats = await api.get('/records/stats').catch(() => null)
  const modal = openModal(`
    <h2>내 정보</h2>
    <p class="sub" style="margin:4px 0 16px">아이디 ${esc(me.loginId)} · Lv.${me.level}${stats ? ` · 누적 ${fmtDuration(stats.totalSec)}` : ''}</p>
    <form class="form">
      <label>닉네임<input name="nickname" maxlength="12" value="${esc(me.nickname)}" required></label>
      <div>
        <div class="sub" style="margin-bottom:6px">캐릭터 <span class="hint">— 바꿔도 레벨·경험치는 그대로예요</span></div>
        <div class="char-grid">${CHARACTERS.map(
          (ch) => `<button type="button" class="char ${ch.id === characterId ? 'on' : ''}" data-id="${esc(ch.id)}" aria-pressed="${ch.id === characterId}">
            <span class="avatar">${avatarOf(ch.id)}</span>${esc(ch.name)}</button>`
        ).join('')}</div>
      </div>
      <div class="error" role="alert"></div>
      <div class="modal-foot" style="justify-content:space-between">
        <button type="button" class="btn text danger-text" data-logout>로그아웃</button>
        <button class="btn primary">저장</button>
      </div>
    </form>`)

  $$('.char', modal.el).forEach(
    (btn) =>
      (btn.onclick = () => {
        characterId = btn.dataset.id
        $$('.char', modal.el).forEach((b) => {
          b.classList.toggle('on', b === btn)
          b.setAttribute('aria-pressed', String(b === btn))
        })
      })
  )
  $('[data-logout]', modal.el).onclick = () => {
    modal.close()
    logout()
  }
  onSubmit($('form', modal.el), async (form) => {
    await api.patch('/auth/me', { nickname: form.get('nickname'), characterId })
    await ctx.refreshMe()
    modal.close()
    ctx.redraw()
  })
}

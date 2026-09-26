import { api } from '../api.js'
import { CHARACTERS, STAGE_NAMES, STAGE_UNLOCK, avatarOf, bodyOf, unlockedStage } from '../characters.js'
import { $, $$, esc, fmtDuration } from '../dom.js'
import { onSubmit, openModal } from '../ui.js'

// 내 정보: 닉네임·캐릭터·표시 모습 바꾸기, 로그아웃. 캐릭터를 바꿔도 레벨·경험치는 그대로다.
// 표시 모습: 자동(열린 것 중 가장 최근 모습) 또는 이미 열린 단계 중 하나 (예: 레벨이 올라도 아기 모습 유지)
export async function openProfile(ctx, logout) {
  const me = ctx.me
  let characterId = me.characterId
  let displayStage = me.displayStage || 0 // 0 = 자동
  const unlocked = unlockedStage(me.level)
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
      <div>
        <div class="sub" style="margin-bottom:6px">표시 모습 <span class="hint">— 열린 모습 중에서 골라요</span></div>
        <div class="stage-grid" data-stages></div>
      </div>
      <div class="error" role="alert"></div>
      <div class="modal-foot" style="justify-content:space-between">
        <button type="button" class="btn text danger-text" data-logout>로그아웃</button>
        <button class="btn primary">저장</button>
      </div>
    </form>`)

  // 고른 캐릭터의 단계별 모습. 아직 열리지 않은 단계는 실루엣으로 보여 주고 고를 수 없다.
  function drawStages() {
    const options = [
      { value: 0, label: '자동', sub: '최신 모습', stage: unlocked },
      ...STAGE_NAMES.map((name, i) => ({
        value: i + 1,
        label: name,
        sub: i + 1 <= unlocked ? `Lv${STAGE_UNLOCK[i]}~` : `Lv${STAGE_UNLOCK[i]}에 열려요`,
        stage: i + 1,
        locked: i + 1 > unlocked,
      })),
    ]
    $('[data-stages]', modal.el).innerHTML = options
      .map(
        (o) => `<button type="button" class="stage-opt ${o.value === displayStage ? 'on' : ''}" data-stage="${o.value}"
          aria-pressed="${o.value === displayStage}" ${o.locked ? 'disabled' : ''}>
          <span class="stage-img">${bodyOf(characterId, o.stage, o.locked ? 'sil' : '')}</span>
          <b>${o.label}</b><span class="hint">${o.sub}</span></button>`
      )
      .join('')
    $$('.stage-opt', modal.el).forEach(
      (btn) =>
        (btn.onclick = () => {
          displayStage = Number(btn.dataset.stage)
          drawStages()
        })
    )
  }
  drawStages()

  $$('.char', modal.el).forEach(
    (btn) =>
      (btn.onclick = () => {
        characterId = btn.dataset.id
        $$('.char', modal.el).forEach((b) => {
          b.classList.toggle('on', b === btn)
          b.setAttribute('aria-pressed', String(b === btn))
        })
        drawStages()
      })
  )
  $('[data-logout]', modal.el).onclick = () => {
    modal.close()
    logout()
  }
  onSubmit($('form', modal.el), async (form) => {
    await api.patch('/auth/me', { nickname: form.get('nickname'), characterId, displayStage: displayStage || null })
    await ctx.refreshMe()
    modal.close()
    ctx.redraw()
  })
}

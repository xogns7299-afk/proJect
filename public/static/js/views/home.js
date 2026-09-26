import { api } from '../api.js'
import { avatarOf } from '../characters.js'
import { $, $$, esc, fmtClock, fmtDuration } from '../dom.js'
import { onSubmit, timeAgo } from '../ui.js'
import { openTimer } from './timer.js'

// 홈(내 페이지): 캐릭터 · 오늘의 공부 · 공부 시작 · 이번 주 목표 · 할 일 요약 · 최근 기록
export async function renderHome(main, ctx) {
  let tick = null
  const redraw = () => main.isConnected && renderHome(main, ctx)

  const [me, stats, timerRes, goals, todos, records] = await Promise.all([
    ctx.refreshMe(),
    api.get('/records/stats'),
    api.get('/timer'),
    api.get('/goals'),
    api.get('/todos'),
    api.get('/records'),
  ])
  if (!main.isConnected) return

  const timer = timerRes.timer
  const todoLeft = todos.filter((t) => !t.done).length

  main.innerHTML = `
    <div class="card me">
      <div class="avatar">${avatarOf(me.characterId, me.level)}</div>
      <div class="me-info">
        <div><b>${esc(me.nickname)}</b> <span class="lv">Lv.${me.level}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${(me.current / me.needed) * 100}%"></div></div>
        <div class="sub">다음 레벨까지 ${me.needed - me.current} XP</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><span class="sub">오늘 누적</span><b>${fmtDuration(stats.todaySec)}</b></div>
      <div class="stat"><span class="sub">이번 주</span><b>${fmtDuration(stats.weekSec)}</b></div>
      <div class="stat"><span class="sub">전체</span><b>${fmtDuration(stats.totalSec)}</b></div>
    </div>

    <button class="btn primary big ${timer ? 'live' : ''}" data-timer>
      ${timer ? `${esc(timer.subject)} ${timer.status === 'paused' ? '쉬는 중' : '공부 중'} · <span data-clock>${fmtClock(timer.elapsedSec)}</span>` : '공부 시작'}
    </button>

    <div class="card">
      <div class="card-head"><h2>이번 주 목표</h2><span class="sub">${goals.items.length ? `달성 ${goals.achievement}% · ` : ''}스터디에 자동 공유</span></div>
      <ul class="checklist">
        ${goals.items
          .map(
            (g) => `<li><label class="check"><input type="checkbox" data-goal="${g.id}" ${g.done ? 'checked' : ''}><span class="${g.done ? 'done' : ''}">${esc(g.title)}</span></label>
              <button class="btn icon" data-goal-del="${g.id}" aria-label="목표 삭제">×</button></li>`
          )
          .join('')}
      </ul>
      <form class="add" data-goal-form><input name="title" maxlength="100" placeholder="목표 추가 (완료하면 +30 XP)" required><button class="btn">추가</button></form>
    </div>

    <a class="card link-card" href="#/todo">
      <div class="card-head"><h2>할 일</h2><span class="sub">전체 보기 ›</span></div>
      <p>진행중 <b>${todoLeft}</b> · 완료 <b>${todos.length - todoLeft}</b></p>
    </a>

    <div class="card">
      <div class="card-head"><h2>최근 기록</h2><a class="sub" href="#/records">전체 보기 ›</a></div>
      <ul class="list">
        ${
          records.length
            ? records
                .slice(0, 3)
                .map(
                  (r) => `<li class="rec"><span class="tag">${esc(r.subject)}</span>
                    <span class="grow sub ellipsis">${esc(r.memo) || '회고 미작성'}</span>
                    <span class="sub">${timeAgo(r.startedAt)}</span><b>${fmtDuration(r.durationSec)}</b></li>`
                )
                .join('')
            : '<li class="sub">아직 기록이 없어요. 공부 시작을 눌러 첫 기록을 남겨 보세요.</li>'
        }
      </ul>
    </div>`

  // 진행 중인 타이머가 있으면 버튼의 시간을 흐르게 한다 (일시정지 중이면 멈춘 채)
  if (timer && timer.status === 'running') {
    const at = performance.now()
    tick = setInterval(() => {
      const clock = $('[data-clock]', main)
      if (!clock) return clearInterval(tick)
      clock.textContent = fmtClock(Math.min(timer.maxSec, timer.elapsedSec + Math.floor((performance.now() - at) / 1000)))
    }, 1000)
  }

  $('[data-timer]', main).onclick = () => {
    clearInterval(tick)
    openTimer(ctx, redraw)
  }
  // 8시간을 넘겨 자동 종료된 기록이 있으면 바로 회고 화면을 띄운다
  if (timerRes.autoStopped) openTimer(ctx, redraw, timerRes)

  $$('[data-goal]', main).forEach(
    (box) =>
      (box.onchange = async () => {
        await api.patch(`/goals/${box.dataset.goal}`, { done: box.checked })
        redraw()
      })
  )
  $$('[data-goal-del]', main).forEach(
    (btn) =>
      (btn.onclick = async () => {
        await api.del(`/goals/${btn.dataset.goalDel}`)
        redraw()
      })
  )
  onSubmit($('[data-goal-form]', main), async (form) => {
    await api.post('/goals', { title: form.get('title') })
    redraw()
  })
}

import { api } from '../api.js'
import { avatarOf, bodyOf, displayStageOf } from '../characters.js'
import { $, $$, esc, fmtClock, fmtDuration } from '../dom.js'
import { liveElapsed, setLive } from '../live.js'
import { onSubmit, timeAgo, toast } from '../ui.js'
import { mountPet } from '../pet.js'
import { openTimer } from './timer.js'

// 한국시간 날짜 계산 (기기 시간대와 상관없이)
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const addDays = (date, n) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dayLabel = (date) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T00:00:00Z'))

const SKELETON = `
  <div class="cols" aria-busy="true">
    <div class="col">
      <div class="card hero"><div class="pet-stage skel"></div>
        <div class="me-info"><div class="skel" style="width:40%;height:20px"></div><div class="skel" style="height:8px"></div><div class="skel" style="width:60%;height:12px"></div></div></div>
      <div class="stats"><div class="stat skel" style="height:60px"></div><div class="stat skel" style="height:60px"></div><div class="stat skel" style="height:60px"></div></div>
      <div class="skel" style="height:54px;border-radius:14px"></div>
    </div>
    <div class="col"><div class="card"><div class="skel" style="width:35%;height:16px;margin-bottom:16px"></div><div class="skel" style="height:14px;margin-bottom:12px"></div><div class="skel" style="height:14px;width:80%"></div></div></div>
  </div>`

// 홈: 캐릭터 · 오늘의 공부 · 공부 시작 · 최근 기록 | 이번 주 목표 · 할 일
// week: 0 = 이번 주, -1 = 지난 주 … (지난 주는 보기만 한다)
export async function renderHome(main, ctx, week = 0) {
  const redraw = (w = week) => main.isConnected && renderHome(main, ctx, w)
  if (!main.firstElementChild) main.innerHTML = SKELETON

  const monday = addDays(kstToday(), -((new Date(kstToday() + 'T00:00:00Z').getUTCDay() + 6) % 7) + week * 7)
  const [me, stats, timerRes, goals, todos, records] = await Promise.all([
    ctx.refreshMe(),
    api.get('/records/stats'),
    api.get('/timer'),
    api.get(`/goals?week=${monday}`),
    api.get('/todos'),
    api.get('/records'),
  ])
  if (!main.isConnected) return

  const timer = timerRes.timer
  setLive(timer)
  const stage = displayStageOf(me.level, me.displayStage)
  const past = week < 0
  const openTodos = todos.filter((t) => !t.done)

  main.innerHTML = `
    <div class="cols home">
      <div class="col">
        <div class="card hero">
          <div class="pet-wrap">
            <div class="pet-stage" data-pet role="button" tabindex="0" aria-label="${esc(me.nickname)}의 캐릭터 (누르면 반응해요)">${bodyOf(me.characterId, stage)}</div>
            <span class="pet-bubble" hidden></span>
          </div>
          <div class="me-info">
            <div class="name"><b>${esc(me.nickname)}</b> <span class="lv">Lv.${me.level}</span></div>
            <div class="bar"><div class="bar-fill" style="width:${(me.current / me.needed) * 100}%"></div></div>
            <div class="sub">다음 레벨까지 ${me.needed - me.current} XP</div>
          </div>
        </div>

        <div class="stats">
          <div class="stat"><span class="sub">오늘 누적</span><b>${fmtDuration(stats.todaySec)}</b></div>
          <div class="stat"><span class="sub">이번 주</span><b>${fmtDuration(stats.weekSec)}</b></div>
          <div class="stat"><span class="sub">전체</span><b>${fmtDuration(stats.totalSec)}</b></div>
        </div>

        <button class="btn big ${timer ? `live ${timer.status === 'paused' ? 'paused' : ''}` : 'primary'}" data-timer>
          ${timer ? `${esc(timer.subject)} ${timer.status === 'paused' ? '쉬는 중' : '공부 중'} · <span data-live-clock>${fmtClock(liveElapsed())}</span>` : '공부 시작'}
        </button>

        <div class="card late">
          <div class="card-head"><h2>최근 기록</h2><a class="sub" href="#/records">전체 보기 ›</a></div>
          <ul class="list">
            ${
              records.length
                ? records
                    .slice(0, 4)
                    .map(
                      (r) => `<li class="rec"><span class="tag">${esc(r.subject)}</span>
                        <span class="grow ellipsis ${r.memo ? '' : 'sub'}">${esc(r.memo) || '회고 미작성'}</span>
                        <span class="sub">${timeAgo(r.startedAt)}</span><b>${fmtDuration(r.durationSec)}</b></li>`
                    )
                    .join('')
                : '<li class="sub">아직 기록이 없어요. 공부 시작을 눌러 첫 기록을 남겨 보세요.</li>'
            }
          </ul>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-head">
            <h2>${past ? (week === -1 ? '지난 주 목표' : `${-week}주 전 목표`) : '이번 주 목표'}</h2>
            <div class="week-nav">
              <button class="btn icon" data-week="${week - 1}" aria-label="이전 주" title="이전 주">‹</button>
              <span class="sub">${goals.items.length ? `달성 ${goals.achievement}%` : ''}</span>
              <button class="btn icon" data-week="${week + 1}" aria-label="다음 주" title="다음 주" ${past ? '' : 'disabled'}>›</button>
            </div>
          </div>
          <p class="week-range">${dayLabel(monday)} ~ ${dayLabel(addDays(monday, 6))}${past ? '' : ' · 스터디에 자동 공유'}</p>
          <ul class="checklist">
            ${goals.items
              .map(
                (g) => `<li><label class="check"><input type="checkbox" data-goal="${g.id}" ${g.done ? 'checked' : ''} ${past ? 'disabled' : ''}><span class="${g.done ? 'done' : ''}">${esc(g.title)}</span></label>
                  ${past ? '' : `<button class="btn icon" data-goal-del="${g.id}" aria-label="목표 삭제" title="삭제">×</button>`}</li>`
              )
              .join('')}
            ${!goals.items.length && past ? '<li class="sub">이 주에는 목표가 없었어요</li>' : ''}
          </ul>
          ${
            past
              ? `<p class="readonly-note">지난 주 목표는 볼 수만 있어요. › 를 누르면 다음 주로 넘어갑니다.</p>`
              : `<form class="add" data-goal-form><input name="title" maxlength="100" placeholder="목표 추가 (완료하면 +30 XP)" required><button class="btn">추가</button></form>`
          }
        </div>

        <div class="card">
          <div class="card-head"><h2>할 일</h2><a class="sub" href="#/todo">진행중 ${openTodos.length} · 완료 ${todos.length - openTodos.length} ›</a></div>
          <ul class="checklist">
            ${
              openTodos.length
                ? openTodos
                    .slice(0, 5)
                    .map((t) => `<li><label class="check"><input type="checkbox" data-todo="${t.id}"><span>${esc(t.title)}</span></label></li>`)
                    .join('')
                : '<li class="sub">진행중인 할 일이 없어요</li>'
            }
          </ul>
        </div>
      </div>
    </div>`

  mountPet($('.pet-wrap', main), me.characterId, stage)
  $('[data-timer]', main).onclick = () => openTimer(ctx, () => redraw())
  // 8시간을 넘겨 자동 종료된 기록이 있으면 바로 회고 화면을 띄운다
  if (timerRes.autoStopped) openTimer(ctx, () => redraw(), timerRes)

  $$('[data-week]', main).forEach((btn) => (btn.onclick = () => redraw(Number(btn.dataset.week))))
  $$('[data-goal]', main).forEach(
    (box) =>
      (box.onchange = async () => {
        box.disabled = true
        try {
          const res = await api.patch(`/goals/${box.dataset.goal}`, { done: box.checked })
          if (res.level > me.level) {
            toast(`<span class="avatar">${avatarOf(me.characterId)}</span>레벨 업! Lv.${res.level}`, 3000)
          } else if (box.checked) {
            toast(res.xpGranted ? `<span class="plus">+30 XP</span> 목표 달성!` : '목표 달성! (경험치는 한 주에 목표 10개까지)')
          }
          await redraw()
          if (res.level > me.level) $('[data-pet]', main)?.classList.add('pop')
        } catch (err) {
          alert(err.message)
          redraw()
        }
      })
  )
  $$('[data-goal-del]', main).forEach(
    (btn) =>
      (btn.onclick = async () => {
        await api.del(`/goals/${btn.dataset.goalDel}`)
        redraw()
      })
  )
  $$('[data-todo]', main).forEach(
    (box) =>
      (box.onchange = async () => {
        await api.patch(`/todos/${box.dataset.todo}`, { done: true })
        redraw()
      })
  )
  const form = $('[data-goal-form]', main)
  if (form)
    onSubmit(form, async (data) => {
      await api.post('/goals', { title: data.get('title') })
      await redraw()
      $('[data-goal-form] input', main)?.focus()
    })
}

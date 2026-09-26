import { api } from '../api.js'
import { avatarOf, timerImageOf } from '../characters.js'
import { bindPhotoRow, photoRowHtml } from '../photo.js'
import { $, $$, esc, fmtClock, fmtDuration } from '../dom.js'
import { onSubmit, openSheet } from '../ui.js'

const MAX_HOURS = 8
const kstTime = (ms) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

export const REVIEW_FIELDS = [
  { key: 'memo', label: '오늘 공부한 내용', rows: 3, placeholder: '예) 자료구조 7장 트리 강의 2개, 연습문제 12~20번', hint: '스터디에 공유돼요' },
  { key: 'reviewGood', label: '성과 — 잘된 점', rows: 2, placeholder: '예) 이진탐색트리 삽입/삭제는 이제 안 보고 구현됨' },
  { key: 'reviewHard', label: '어려웠던 점', rows: 2, placeholder: '예) AVL 회전 조건이 아직 헷갈림. 내일 다시' },
  { key: 'reviewNote', label: '비고', rows: 2, placeholder: '예) 카페 소음 심해서 집중 잘 안 됨' },
]

export const reviewFieldsHtml = (values = {}) =>
  REVIEW_FIELDS.map(
    (f) => `<label><span>${esc(f.label)}${f.hint ? ` <span class="pill">${esc(f.hint)}</span>` : ''}</span>
      <textarea name="${f.key}" rows="${f.rows}" maxlength="1000" placeholder="${esc(f.placeholder)}">${esc(values[f.key])}</textarea></label>`
  ).join('')

// 타이머 전체 화면. 준비 → 진행 → 회고 → 완료. 닫아도 타이머는 서버에서 계속 돌아간다.
// 화면의 숫자는 장식이고, 기준은 항상 서버가 알려준 값이다.
// initial: 홈이 이미 받아 둔 GET /api/timer 응답. 자동 종료 결과는 서버가 한 번만 알려주므로 그대로 넘겨받는다.
export async function openTimer(ctx, onClose, initial) {
  const screen = document.createElement('div')
  screen.className = 'fullscreen'
  document.body.append(screen)

  let tick = null
  let sync = null
  let closed = false

  function close() {
    closed = true
    clearInterval(tick)
    clearInterval(sync)
    document.removeEventListener('visibilitychange', onVisible)
    screen.remove()
    onClose?.()
  }
  const onVisible = () => !document.hidden && running && refresh()
  document.addEventListener('visibilitychange', onVisible)

  const frame = (step, body) => {
    screen.innerHTML = `
      <div class="fs-inner">
        <header class="top"><h1>공부 타이머</h1><span class="sub">${esc(step)}</span></header>
        ${body}
      </div>`
  }

  // ---------- 1. 준비 ----------
  async function showSetup(selectedId = 0) {
    running = null
    const subjects = await api.get('/subjects')
    frame(
      '1 / 3 준비',
      `<div class="fs-body">
        <div><h2>무슨 공부를 하시나요?</h2><p class="sub">미리 등록해 둔 과목에서 고르세요.</p></div>
        <div class="chips">
          ${subjects.map((s) => `<button class="chip ${s.id === selectedId ? 'on' : ''}" data-subject="${s.id}">${esc(s.name)}</button>`).join('')}
          <button class="chip dashed" data-add>＋ 과목 추가</button>
        </div>
        ${subjects.length ? '' : '<p class="sub">아직 등록한 과목이 없어요. 먼저 과목을 추가해 주세요.</p>'}
        <div class="notice">
          <b>한 번에 최대 ${MAX_HOURS}시간까지 기록돼요.</b>
          더 공부할 때는 한 번 끊고 점검한 뒤 다시 타이머를 켜 주세요. 쉴 때는 <b>일시정지</b>를 누르면 그 시간은 공부시간에서 빠집니다.
        </div>
        <div class="error" role="alert"></div>
      </div>
      <div class="fs-foot row">
        <button class="btn big" data-back>뒤로</button>
        <button class="btn primary big" data-start ${selectedId ? '' : 'disabled'}>타이머 시작</button>
      </div>`
    )
    $$('[data-subject]', screen).forEach((b) => (b.onclick = () => showSetup(Number(b.dataset.subject))))
    $('[data-back]', screen).onclick = close
    $('[data-add]', screen).onclick = () => {
      const sheet = openSheet(`
        <form class="form"><h2>과목 추가</h2>
          <label>과목 이름<input name="name" maxlength="20" placeholder="예: 수학, 토익, 전공" required></label>
          <div class="error" role="alert"></div>
          <button class="btn primary big">추가</button>
        </form>`)
      onSubmit($('form', sheet.el), async (form) => {
        const created = await api.post('/subjects', { name: form.get('name') })
        sheet.close()
        showSetup(created.id)
      })
    }
    $('[data-start]', screen).onclick = async (e) => {
      e.currentTarget.disabled = true
      try {
        const res = await api.post('/timer/start', { subjectId: selectedId })
        showRun(res.timer)
      } catch (err) {
        // 다른 기기에서 이미 시작한 경우 등: 서버 상태를 다시 읽어 맞춘다
        if (err.status === 409) return refresh()
        $('.error', screen).textContent = err.message
        e.currentTarget.disabled = false
      }
    }
  }

  // ---------- 2. 진행 ----------
  let running = null // { timer, at } — 서버 값과 그 값을 받은 순간

  function current() {
    const { timer, at } = running
    const dt = Math.floor((performance.now() - at) / 1000)
    const paused = timer.status === 'paused'
    return {
      elapsed: timer.elapsedSec + (paused ? 0 : dt),
      total: timer.totalSec + dt,
      rest: timer.pausedSec + (paused ? dt : 0),
    }
  }

  function showRun(timer) {
    running = { timer, at: performance.now() }
    const paused = timer.status === 'paused'
    frame(
      '2 / 3 진행',
      `<div class="fs-body">
        <div class="dial">
          ${timerImageOf(ctx.me.characterId).replace('<img', '<img class="timer-pet"')}
          <span class="status ${paused ? 'hold' : 'go'}"><i></i>${paused ? '쉬는 중' : '공부 중'}</span>
          <p class="bigtime" data-elapsed>0:00:00</p>
          <p class="sub">공부시간</p>
          <div class="subtimes">
            <div><span class="sub">총 경과 · 참고</span><b data-total>0:00:00</b></div>
            <div><span class="sub">휴식 · 차감됨</span><b data-rest>0:00:00</b></div>
          </div>
        </div>
        <div class="card kindline"><b>${esc(timer.subject)}</b><span class="sub">${kstTime(timer.startedAt)} 시작</span></div>
        ${photoRowHtml('오공시 사진', 'start', timer.startPhoto && `/api/photos/${timer.startPhoto}`)}
        <div class="error" role="alert"></div>
      </div>
      <div class="fs-foot col">
        <button class="btn big ${paused ? 'primary' : 'warn'}" data-pause>${paused ? '공부 재개' : '일시정지'}</button>
        <button class="btn big danger" data-stop>공부 종료</button>
        <button class="btn text" data-min>타이머를 켜 둔 채 홈으로</button>
      </div>`
    )
    const paint = () => {
      const t = current()
      $('[data-elapsed]', screen).textContent = fmtClock(Math.min(t.elapsed, timer.maxSec))
      $('[data-total]', screen).textContent = fmtClock(t.total)
      $('[data-rest]', screen).textContent = fmtClock(t.rest)
      // 8시간을 채우면 서버가 자동으로 종료한다
      if (t.elapsed >= timer.maxSec) refresh()
    }
    clearInterval(tick)
    tick = setInterval(paint, 500)
    paint()
    // 다른 기기에서 일시정지·종료했을 수 있으므로 주기적으로 서버 값에 맞춘다
    clearInterval(sync)
    sync = setInterval(refresh, 30000)

    const act = (path) => async (e) => {
      e.currentTarget.disabled = true
      try {
        const res = await api.post(path)
        if (path === '/timer/stop') afterStop(res)
        else showRun(res.timer)
      } catch (err) {
        if (err.status === 409) return refresh()
        $('.error', screen).textContent = err.message
        e.currentTarget.disabled = false
      }
    }
    $('[data-pause]', screen).onclick = act(paused ? '/timer/resume' : '/timer/pause')
    $('[data-stop]', screen).onclick = act('/timer/stop')
    $('[data-min]', screen).onclick = close
    bindPhotoRow(screen, 'start', timer.id)
  }

  async function refresh() {
    if (closed) return
    const res = await api.get('/timer')
    if (closed) return
    if (res.autoStopped) return afterStop(res.autoStopped)
    if (res.timer) return showRun(res.timer)
    if (running) close() // 다른 기기에서 이미 종료한 경우
    else showSetup()
  }

  function afterStop(res) {
    clearInterval(tick)
    clearInterval(sync)
    running = null
    ctx.refreshMe().catch(() => {})
    if (res.discarded) return showDiscarded(res)
    showWrap(res)
  }

  function showDiscarded(res) {
    frame(
      '종료',
      `<div class="fs-body center-col">
        <div class="done-mark">⏱</div>
        <h2>기록되지 않았어요</h2>
        <p class="sub center">${Math.round(res.minSec / 60)}분 미만의 공부(${res.durationSec}초)는 기록으로 남기지 않습니다.</p>
      </div>
      <div class="fs-foot"><button class="btn primary big" data-home>홈으로</button></div>`
    )
    $('[data-home]', screen).onclick = close
  }

  // ---------- 3. 회고 ----------
  function showWrap(res) {
    const r = res.record
    const nextDay = kstDay(r.startedAt) !== kstDay(r.endedAt)
    frame(
      '3 / 3 회고',
      `<form class="fs-body form">
        <div><h2>오늘 공부, 어땠나요?</h2><p class="sub">기록은 이미 저장되어 있습니다. 회고는 나중에 채워도 됩니다.</p></div>
        ${res.capped ? `<div class="notice warn"><b>${MAX_HOURS}시간을 채워 자동으로 종료됐어요.</b> 더 공부할 때는 잠깐 점검한 뒤 타이머를 다시 켜 주세요.</div>` : ''}
        <div class="summary">
          <div><span>${esc(r.subject)}</span><b></b></div>
          <div><span>시작</span><b>${kstTime(r.startedAt)}</b></div>
          <div><span>종료</span><b>${kstTime(r.endedAt)}${nextDay ? ' <span class="pill warn">익일</span>' : ''}</b></div>
          <div><span>총 경과</span><b>${fmtClock(r.totalSec)}</b></div>
          <div><span>휴식 (${r.pauseCount}회) — 차감</span><b>− ${fmtClock(r.pausedSec)}</b></div>
          <div class="net"><span>공부시간</span><b>${fmtClock(r.durationSec)}</b></div>
        </div>
        ${photoRowHtml('오공완 사진', 'end', null)}
        ${reviewFieldsHtml()}
        <div class="error" role="alert"></div>
        <div class="row">
          <button type="button" class="btn big" data-later>나중에 쓰기</button>
          <button class="btn primary big">회고 저장</button>
        </div>
      </form>`
    )
    bindPhotoRow(screen, 'end', r.id)
    $('[data-later]', screen).onclick = () => showDone(res, false)
    onSubmit($('form', screen), async (form) => {
      await api.patch(`/records/${r.id}`, Object.fromEntries(form))
      showDone(res, true)
    })
  }

  // ---------- 4. 완료 ----------
  async function showDone(res, withReview) {
    const stats = await api.get('/records/stats').catch(() => null)
    frame(
      '완료',
      `<div class="fs-body center-col">
        <div class="avatar xl ${res.leveledUp ? 'pop' : ''}">${avatarOf(ctx.me.characterId, res.level)}</div>
        <h2>${res.leveledUp ? `레벨 업! Lv.${res.level}` : withReview ? '오늘도 수고했어요' : '기록만 저장했어요'}</h2>
        <p class="sub center">${withReview ? '공부 기록과 회고가 저장되었습니다.' : '회고는 기록 탭에서 언제든 이어서 쓸 수 있습니다.'}</p>
        <div class="stats">
          <div class="stat"><span class="sub">이번 기록</span><b>${fmtDuration(res.record.durationSec)}</b></div>
          <div class="stat"><span class="sub">오늘 누적</span><b>${stats ? fmtDuration(stats.todaySec) : '-'}</b></div>
          <div class="stat"><span class="sub">경험치</span><b>+${res.xpGained} XP</b></div>
        </div>
        <div class="xp-line">
          <span class="lv">Lv.${res.level}</span>
          <span class="bar grow"><span class="bar-fill" style="width:${(res.current / res.needed) * 100}%"></span></span>
          <span class="sub">${res.current} / ${res.needed}</span>
        </div>
        <p class="sub center">가입한 스터디에 자동으로 공유됩니다 · 개인 누적에도 반영</p>
      </div>
      <div class="fs-foot"><button class="btn primary big" data-home>홈으로</button></div>`
    )
    $('[data-home]', screen).onclick = close
  }

  frame('', '<div class="fs-body sub">불러오는 중…</div>')
  try {
    if (initial?.autoStopped) afterStop(initial.autoStopped)
    else await refresh()
  } catch (err) {
    alert(err.message)
    close()
  }
}

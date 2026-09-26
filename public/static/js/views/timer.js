import { api } from '../api.js'
import { STAGE_NAMES, STAGE_UNLOCK, bodyOf, displayStageOf, has, imgOf, unlockedStage } from '../characters.js'
import { bindPhotoRow, photoRowHtml } from '../photo.js'
import { $, $$, esc, fmtClock, fmtDuration } from '../dom.js'
import { setLive } from '../live.js'
import { animateTimer } from '../pet.js'
import { closeLayer, onSubmit, openModal, pushLayer } from '../ui.js'

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

const STEPS = ['준비', '진행', '회고']

// 타이머 집중 모드(화면 전체). 준비 → 진행 → 회고 → 완료.
// 닫아도(Esc·브라우저 뒤로가기 포함) 타이머는 서버에서 계속 돌아간다. 화면의 숫자는 장식이고, 기준은 항상 서버 값이다.
// initial: 홈이 이미 받아 둔 GET /api/timer 응답. 자동 종료 결과는 서버가 한 번만 알려주므로 그대로 넘겨받는다.
export async function openTimer(ctx, onClose, initial) {
  const screen = document.createElement('div')
  screen.className = 'focus'
  screen.setAttribute('role', 'dialog')
  screen.setAttribute('aria-label', '공부 타이머')

  let tick = null
  let sync = null
  let closed = false
  let running = null // { timer, at } — 서버 값과 그 값을 받은 순간
  let memoDraft = ''
  let finished = false // 회고·완료 단계에서는 서버 상태를 다시 읽어 화면을 바꾸지 않는다
  let refreshing = null

  const onVisible = () => !document.hidden && running && refresh()
  document.addEventListener('visibilitychange', onVisible)
  pushLayer(screen, () => {
    closed = true
    clearInterval(tick)
    clearInterval(sync)
    document.removeEventListener('visibilitychange', onVisible)
    onClose?.()
  })
  const close = () => closeLayer(screen)

  const frame = (step, body, action = '') => {
    screen.innerHTML = `
      <div class="focus-top">
        <h1>공부 타이머</h1>
        ${step ? `<div class="steps">${STEPS.map((s, i) => `<span class="${i + 1 === step ? 'on' : ''}">${i + 1}. ${s}</span>`).join('')}</div>` : '<span></span>'}
        ${action || '<span></span>'}
      </div>
      ${body}`
  }
  const closeBtn = (label) => `<button class="btn" data-close>${label} <kbd class="desktop-only">Esc</kbd></button>`
  const bindClose = () => $$('[data-close]', screen).forEach((b) => (b.onclick = close))

  // ---------- 1. 준비 ----------
  async function showSetup(selectedId = 0) {
    running = null
    const subjects = await api.get('/subjects')
    if (closed) return
    const nameOf = (id) => subjects.find((s) => s.id === id)?.name
    const bubbleText = (id) => (id ? `${esc(nameOf(id))}, 좋아! 오늘은 뭘 할까?` : '오늘은 무슨 공부를 할까?')
    frame(
      1,
      `<div class="focus-body">
        <div class="col">
          <div class="setup-pet">${bodyOf(ctx.me.characterId, displayStageOf(ctx.me.level, ctx.me.displayStage), 'breathe')}<div class="bubble" data-bubble>${bubbleText(selectedId)}</div></div>
          <div class="notice"><b>한 번에 최대 ${MAX_HOURS}시간까지 기록돼요.</b> 더 공부할 때는 한 번 끊고 점검한 뒤 다시 타이머를 켜 주세요.
            쉴 때는 <b>일시정지</b>를 누르면 그 시간은 공부시간에서 빠집니다.</div>
        </div>
        <div class="card form">
          <div><h2>무슨 공부를 하시나요?</h2><p class="sub">미리 등록해 둔 과목에서 고르세요.</p></div>
          <div class="chips">
            ${subjects.map((s) => `<button class="chip ${s.id === selectedId ? 'on' : ''}" data-subject="${s.id}" aria-pressed="${s.id === selectedId}">${esc(s.name)}</button>`).join('')}
            <button class="chip dashed" data-add>＋ 과목 추가</button>
          </div>
          ${subjects.length ? '' : '<p class="sub">아직 등록한 과목이 없어요. 먼저 과목을 추가해 주세요.</p>'}
          <label><span>오늘의 공부 내용 <span class="pill">선택</span></span>
            <textarea data-memo rows="3" maxlength="1000" placeholder="예) 미적분 3단원 연습문제 1~30번">${esc(memoDraft)}</textarea>
            <span class="hint">끝나고 회고의 "오늘 공부한 내용"에 그대로 옮겨져요. 비워 둬도 됩니다.</span></label>
          <div class="error" role="alert"></div>
          <div class="modal-foot sticky-foot">
            <button class="btn" data-close>뒤로</button>
            <button class="btn primary" data-start ${selectedId ? '' : 'disabled'}>타이머 시작</button>
          </div>
        </div>
      </div>`,
      closeBtn('닫기')
    )
    bindClose()
    $('[data-memo]', screen).oninput = (e) => (memoDraft = e.target.value)
    $$('[data-subject]', screen).forEach(
      (b) =>
        (b.onclick = () => {
          selectedId = Number(b.dataset.subject)
          $$('[data-subject]', screen).forEach((c) => {
            c.classList.toggle('on', c === b)
            c.setAttribute('aria-pressed', String(c === b))
          })
          $('[data-bubble]', screen).innerHTML = bubbleText(selectedId)
          $('[data-start]', screen).disabled = false
        })
    )
    $('[data-add]', screen).onclick = () => {
      const modal = openModal(`
        <form class="form"><h2>과목 추가</h2>
          <label>과목 이름<input name="name" maxlength="20" placeholder="예: 수학, 토익, 전공" required></label>
          <div class="error" role="alert"></div>
          <div class="modal-foot"><button class="btn primary">추가</button></div>
        </form>`)
      onSubmit($('form', modal.el), async (form) => {
        const created = await api.post('/subjects', { name: form.get('name') })
        modal.close()
        showSetup(created.id)
      })
    }
    $('[data-start]', screen).onclick = async (e) => {
      const btn = e.currentTarget // await 뒤에는 e.currentTarget 이 null 이 된다
      btn.disabled = true
      try {
        const res = await api.post('/timer/start', { subjectId: selectedId, memo: memoDraft })
        showRun(res.timer)
      } catch (err) {
        // 다른 탭·기기에서 이미 시작한 경우 등: 서버 상태를 다시 읽어 맞춘다
        if (err.status === 409) return refresh()
        $('.error', screen).textContent = err.message
        btn.disabled = false
      }
    }
  }

  // ---------- 2. 진행 ----------
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
    setLive(timer)
    const paused = timer.status === 'paused'
    // 일시정지 중에는 쉬는 그림 + Zzz (쉬는 그림이 없는 캐릭터는 타이머 그림을 흐리게)
    const pet = paused
      ? imgOf(ctx.me.characterId, 'rest', `timer-pet${has(ctx.me.characterId, 'rest') ? '' : ' resting'}`) + '<span class="zzz" aria-hidden="true">Zzz</span>'
      : imgOf(ctx.me.characterId, 'timer1', 'timer-pet')
    frame(
      2,
      `<div class="focus-body">
        <div class="dial">
          <div class="timer-pet-wrap">${pet}</div>
          <span class="status ${paused ? 'hold' : 'go'}"><i></i>${paused ? '쉬는 중' : '공부 중'}</span>
          <p class="bigtime" data-elapsed>0:00:00</p>
          <p class="sub">공부시간</p>
          <div class="subtimes">
            <div><span class="sub">총 경과 · 참고</span><b data-total>0:00:00</b></div>
            <div><span class="sub">휴식 · 차감됨</span><b data-rest>0:00:00</b></div>
          </div>
        </div>
        <div class="col">
          <div class="card kindline"><span class="grow"><b>${esc(timer.subject)}</b>${timer.memo ? ` <span class="sub">· ${esc(timer.memo)}</span>` : ''}</span><span class="sub">${kstTime(timer.startedAt)} 시작</span></div>
          ${photoRowHtml('오공시 사진', 'start', timer.startPhoto && `/api/photos/${timer.startPhoto}`)}
          <div class="error" role="alert"></div>
          <p class="hint">이 화면을 닫거나 다른 탭으로 가도 타이머는 서버에서 계속 돌아가요. 브라우저 탭 제목과 메뉴에 시간이 보여요.</p>
          <div class="controls sticky-foot">
            <button class="btn big ${paused ? 'primary' : 'warn'}" data-pause>${paused ? '공부 재개' : '일시정지'}</button>
            <button class="btn big danger" data-stop>공부 종료</button>
          </div>
        </div>
      </div>`,
      closeBtn('타이머 켜 둔 채 나가기')
    )
    bindClose()
    const paint = () => {
      const t = current()
      $('[data-elapsed]', screen).textContent = fmtClock(Math.min(t.elapsed, timer.maxSec))
      $('[data-total]', screen).textContent = fmtClock(t.total)
      $('[data-rest]', screen).textContent = fmtClock(t.rest)
      // 8시간을 채우면 서버가 자동으로 종료한다 (결과를 한 번만 받아 회고로 넘어간다)
      if (t.elapsed >= timer.maxSec) {
        clearInterval(tick)
        refresh()
      }
    }
    if (!paused) animateTimer($('.timer-pet', screen), ctx.me.characterId)
    clearInterval(tick)
    tick = setInterval(paint, 500)
    paint()
    // 다른 탭·기기에서 일시정지·종료했을 수 있으므로 주기적으로 서버 값에 맞춘다
    clearInterval(sync)
    sync = setInterval(refresh, 30000)

    $('[data-pause]', screen).onclick = async (e) => {
      const btn = e.currentTarget
      btn.disabled = true
      try {
        const res = await api.post(paused ? '/timer/resume' : '/timer/pause')
        // 8시간을 넘긴 상태였다면 서버가 그 자리에서 종료하고 결과를 준다
        if (res.autoStopped) return afterStop(res.autoStopped)
        showRun(res.timer)
      } catch (err) {
        if (err.status === 409) return refresh()
        $('.error', screen).textContent = err.message
        btn.disabled = false
      }
    }
    $('[data-stop]', screen).onclick = () => confirmStop()
    bindPhotoRow(screen, 'start', timer.id)
  }

  // 종료는 되돌릴 수 없으므로 한 번 더 묻는다
  function confirmStop() {
    const elapsed = Math.min(current().elapsed, running.timer.maxSec)
    const short = elapsed < 60
    const modal = openModal(`
      <h2>공부를 끝낼까요?</h2>
      <p class="sub" style="margin:8px 0 18px">${
        short
          ? '아직 1분이 안 돼서 <b style="color:var(--text)">기록되지 않아요.</b> 그래도 끝낼까요?'
          : `지금까지 <b style="color:var(--text)">${fmtDuration(elapsed)}</b> 공부했어요. 끝내면 이 타이머는 다시 이어갈 수 없어요.`
      }</p>
      <div class="error" role="alert"></div>
      <div class="modal-foot"><button class="btn" data-keep>계속 공부</button><button class="btn danger" data-confirm>공부 종료</button></div>`)
    $('[data-keep]', modal.el).onclick = modal.close
    $('[data-keep]', modal.el).focus()
    $('[data-confirm]', modal.el).onclick = async (e) => {
      e.currentTarget.disabled = true
      try {
        const res = await api.post('/timer/stop')
        modal.close()
        afterStop(res)
      } catch (err) {
        modal.close()
        if (err.status === 409) return refresh()
        alert(err.message)
      }
    }
  }

  // 여러 곳(8시간 도달, 30초 동기화, 탭 복귀)에서 불러도 요청은 한 번만 보낸다
  function refresh() {
    refreshing ||= load().finally(() => (refreshing = null))
    return refreshing
  }
  async function load() {
    if (closed || finished) return
    const res = await api.get('/timer')
    if (closed || finished) return
    if (res.autoStopped) return afterStop(res.autoStopped)
    if (res.timer) return showRun(res.timer)
    setLive(null)
    if (running) close() // 다른 탭·기기에서 이미 종료한 경우
    else showSetup()
  }

  function afterStop(res) {
    finished = true
    clearInterval(tick)
    clearInterval(sync)
    running = null
    setLive(null)
    ctx.refreshMe().catch(() => {})
    if (res.discarded) return showDiscarded(res)
    showWrap(res)
  }

  function showDiscarded(res) {
    frame(
      0,
      `<div class="focus-body single"><div class="center-col">
        <div class="done-mark">⏱</div>
        <h2>기록되지 않았어요</h2>
        <p class="sub">${Math.round(res.minSec / 60)}분 미만의 공부(${res.durationSec}초)는 기록으로 남기지 않습니다.</p>
        <button class="btn primary big" data-close style="max-width:320px">홈으로</button>
      </div></div>`
    )
    bindClose()
  }

  // ---------- 3. 회고 ----------
  function showWrap(res) {
    const r = res.record
    const nextDay = kstDay(r.startedAt) !== kstDay(r.endedAt)
    frame(
      3,
      `<div class="focus-body">
        <div class="col">
          <div><h2>오늘 공부, 어땠나요?</h2><p class="sub">기록은 이미 저장되어 있습니다. 회고는 나중에 채워도 됩니다.</p></div>
          ${res.capped ? `<div class="notice warn"><b>${MAX_HOURS}시간을 채워 자동으로 종료됐어요.</b> 더 공부할 때는 잠깐 점검한 뒤 타이머를 다시 켜 주세요.</div>` : ''}
          <div class="summary">
            <div><span>과목</span><b>${esc(r.subject)}</b></div>
            <div><span>시작</span><b>${kstTime(r.startedAt)}</b></div>
            <div><span>종료</span><b>${kstTime(r.endedAt)}${nextDay ? ' <span class="pill warn">익일</span>' : ''}</b></div>
            <div><span>총 경과</span><b>${fmtClock(r.totalSec)}</b></div>
            <div><span>휴식 (${r.pauseCount}회) — 차감</span><b>− ${fmtClock(r.pausedSec)}</b></div>
            <div class="net"><span>공부시간</span><b>${fmtClock(r.durationSec)}</b></div>
          </div>
          ${photoRowHtml('오공완 사진', 'end', null)}
        </div>
        <form class="card form">
          ${reviewFieldsHtml({ memo: r.memo })}
          <div class="error" role="alert"></div>
          <div class="modal-foot sticky-foot"><button type="button" class="btn" data-later>나중에 쓰기</button><button class="btn primary">회고 저장</button></div>
        </form>
      </div>`
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
    if (closed) return
    const stage = displayStageOf(res.level, ctx.me.displayStage)
    // 이번 레벨업으로 새 성장 단계가 열렸는지 (Lv5·Lv10. 기록 1건 경험치 상한 때문에 두 단계를 한 번에 넘지는 않는다)
    const newStage = res.leveledUp && STAGE_UNLOCK.includes(res.level) ? unlockedStage(res.level) : 0
    frame(
      0,
      `<div class="focus-body single"><div class="center-col">
        <div class="pet-stage xl">${
          res.leveledUp
            ? // 레벨업: 검은 실루엣 위로 1초 동안 색이 아래에서부터 채워진다
              bodyOf(ctx.me.characterId, stage, 'sil') + bodyOf(ctx.me.characterId, stage, 'reveal')
            : bodyOf(ctx.me.characterId, stage, 'breathe')
        }</div>
        <h2>${res.leveledUp ? `레벨 업! Lv.${res.level}` : withReview ? '오늘도 수고했어요' : '기록만 저장했어요'}</h2>
        ${newStage && stage < newStage ? `<p class="notice">새 모습(${STAGE_NAMES[newStage - 1]})이 열렸어요! 내 정보에서 표시 모습을 바꿀 수 있어요.</p>` : ''}
        <p class="sub">${withReview ? '공부 기록과 회고가 저장되었습니다.' : '회고는 기록 메뉴에서 언제든 이어서 쓸 수 있습니다.'}</p>
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
        <p class="sub">가입한 스터디에 자동으로 공유됩니다 · 개인 누적에도 반영</p>
        <button class="btn primary big" data-close style="max-width:320px">홈으로</button>
      </div></div>`
    )
    bindClose()
  }

  frame(0, '<div class="focus-body single"><p class="sub center">불러오는 중…</p></div>')
  try {
    if (initial?.autoStopped) afterStop(initial.autoStopped)
    else await refresh()
  } catch (err) {
    alert(err.message)
    close()
  }
}

import { fmtClock } from './dom.js'

// 진행 중인 타이머를 화면 어디서나 보여준다: 왼쪽 메뉴의 초록 칸, 브라우저 탭 제목, [data-live-clock] 글자.
// 기준은 서버가 알려준 값이고, 여기서는 받은 순간부터 1초씩 더해 보여줄 뿐이다.
let state = null // { timer, at }
let baseTitle = 'proJect'
let tick = null

export function setLive(timer) {
  state = timer ? { timer, at: performance.now() } : null
  clearInterval(tick)
  if (state && timer.status === 'running') tick = setInterval(paint, 1000)
  paint()
}

export function setBaseTitle(title) {
  baseTitle = title
  paint()
}

export function liveElapsed() {
  if (!state) return 0
  const { timer, at } = state
  const dt = timer.status === 'running' ? Math.floor((performance.now() - at) / 1000) : 0
  return Math.min(timer.maxSec, timer.elapsedSec + dt)
}

function paint() {
  // 왼쪽 메뉴(PC)와 상단 알약(좁은 창) 두 곳에 있다
  const boxes = document.querySelectorAll('[data-live]')
  if (!state) {
    document.title = baseTitle
    boxes.forEach((box) => (box.hidden = true))
    return
  }
  const { timer } = state
  const paused = timer.status === 'paused'
  const clock = fmtClock(liveElapsed())
  document.title = paused ? `⏸ ${timer.subject} 쉬는 중 · proJect` : `⏱ ${clock} ${timer.subject} · proJect`
  boxes.forEach((box) => {
    box.hidden = false
    box.classList.toggle('paused', paused)
    box.querySelector('span').textContent = `${timer.subject} ${paused ? '쉬는 중' : '공부 중'}`
    box.querySelector('b').textContent = paused ? `⏸ ${clock}` : `⏱ ${clock}`
  })
  document.querySelectorAll('[data-live-clock]').forEach((el) => (el.textContent = clock))
}

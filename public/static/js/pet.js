import { find, preload, srcOf, stageOf } from './characters.js'

// 캐릭터 애니메이션. 수치는 캐릭터 미리보기(Claude Design 제작)와 같다.
// 기기에서 "동작 줄이기"를 켜 두면 움직이지 않고 정지 그림만 보여준다.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const WALK_FRAME_MS = 220
const WALK_MS = 4000
// 걷는 동안에는 조금 작게 해서 칸 안에서 실제로 오른쪽→왼쪽으로 오가게 한다 (제자리에서 다리만 바뀌면 파닥이는 것처럼 보인다)
const WALK_SCALE = 0.82
const WALK_RANGE = 12 // 가운데에서 좌우로 움직이는 최대 거리(px). 칸이 작으면(좁은 창) 잘리지 않게 줄인다
const WALK_BOB = 2 // 발을 드는 그림에서 몸이 뜨는 높이(px)
const REACT_MS = 800
const TIMER_FRAME_MS = 350

// 홈 캐릭터: 숨쉬기 → 가끔 칸 안을 오가며 걷기 → 누르면 반응 그림·점프·말풍선.
// Lv5 이상은 성장한 모습이라, 아기 모습인 걷기·반응 그림 대신 성장 그림에 움직임만 준다.
// wrap = .pet-wrap (안에 .pet-stage > img, .pet-bubble)
export function mountPet(wrap, characterId, level) {
  const img = wrap.querySelector('img')
  const bubble = wrap.querySelector('.pet-bubble')
  const base = srcOf(characterId, stageOf(level))
  const baby = level < 5
  if (baby) preload(characterId, ['walk1', 'walk2', 'react'])
  img.classList.add('breathe')

  let busy = false
  let walkTimer = null
  let walkFrame = 0
  const alive = () => wrap.isConnected

  function rest() {
    busy = false
    cancelAnimationFrame(walkFrame)
    img.src = base
    img.style.transform = ''
    img.classList.add('breathe')
  }

  function walk() {
    if (!alive()) return
    if (busy || reduced() || document.hidden || !baby) return schedule()
    busy = true
    img.classList.remove('breathe')
    const start = performance.now()
    const half = WALK_MS / 2
    const stageWidth = img.parentElement.clientWidth
    const range = Math.max(0, Math.min(WALK_RANGE, (stageWidth - img.clientWidth * WALK_SCALE) / 2 - 1))
    const step = (now) => {
      if (!alive()) return
      const t = now - start
      if (t >= WALK_MS) {
        rest()
        return schedule()
      }
      // 앞 절반은 오른쪽을 보고 왼쪽 끝→오른쪽 끝, 뒤 절반은 돌아서 오른쪽 끝→왼쪽 끝
      const dir = t < half ? 1 : -1
      const x = dir * range * (2 * ((t % half) / half) - 1)
      const lifted = Math.floor(t / WALK_FRAME_MS) % 2 === 1
      const src = srcOf(characterId, lifted ? 'walk2' : 'walk1')
      if (img.getAttribute('src') !== src) img.src = src
      img.style.transform = `translate(${x.toFixed(1)}px, ${lifted ? -WALK_BOB : 0}px) scale(${dir * WALK_SCALE}, ${WALK_SCALE})`
      walkFrame = requestAnimationFrame(step)
    }
    walkFrame = requestAnimationFrame(step)
  }

  function schedule() {
    clearTimeout(walkTimer)
    if (alive()) walkTimer = setTimeout(walk, 8000 + Math.random() * 6000)
  }

  function react() {
    clearTimeout(walkTimer)
    cancelAnimationFrame(walkFrame)
    busy = true
    img.style.transform = ''
    if (baby) img.src = srcOf(characterId, 'react')
    bubble.textContent = find(characterId).say
    bubble.hidden = false
    if (!reduced()) {
      img.classList.remove('breathe', 'jump')
      void img.offsetWidth // 연달아 눌러도 점프가 다시 시작되게
      img.classList.add('jump')
    }
    setTimeout(() => {
      if (!alive()) return
      img.classList.remove('jump')
      bubble.hidden = true
      rest()
      schedule()
    }, REACT_MS)
  }

  wrap.querySelector('.pet-stage').onclick = react
  // 값을 돌려주지 않는다 (false를 돌려주면 Tab 같은 다른 키도 막힌다)
  wrap.querySelector('.pet-stage').onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    react()
  }
  schedule()
}

// 타이머 진행 화면: 앞발 흔들기 1→2→3→2 반복. 이미지가 화면에서 사라지면 스스로 멈춘다.
export function animateTimer(img, characterId) {
  if (reduced()) return
  preload(characterId, ['timer1', 'timer2', 'timer3'])
  const order = ['timer1', 'timer2', 'timer3', 'timer2']
  let i = 0
  const id = setInterval(() => {
    if (!img.isConnected) return clearInterval(id)
    if (document.hidden) return
    i = (i + 1) % order.length
    img.src = srcOf(characterId, order[i])
  }, TIMER_FRAME_MS)
}

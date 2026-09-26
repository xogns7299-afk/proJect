import { $ } from './dom.js'

// 화면 위에 겹쳐 뜨는 것(대화상자, 타이머 집중 모드)을 쌓아 관리한다.
// 하나 열 때마다 브라우저 기록에 한 칸을 쌓아서, 브라우저 뒤로가기로 맨 위의 것이 닫히게 한다.
// Esc는 맨 위의 것을 닫는다.
const layers = [] // { el, onClose }
let skipPop = 0

export function pushLayer(el, onClose) {
  document.body.append(el)
  layers.push({ el, onClose })
  history.pushState({ layer: layers.length }, '')
}

export function closeLayer(el) {
  const i = layers.findIndex((l) => l.el === el)
  if (i < 0) return
  const [layer] = layers.splice(i, 1)
  layer.el.remove()
  layer.onClose?.()
  // 쌓아 둔 기록 한 칸을 되돌린다. 이때 생기는 popstate는 무시한다
  skipPop++
  history.back()
}

window.addEventListener('popstate', () => {
  if (skipPop) return skipPop--
  const layer = layers.pop()
  if (!layer) return
  layer.el.remove()
  layer.onClose?.()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) closeLayer(layers[layers.length - 1].el)
})

// 화면 가운데 대화상자. html을 넣어 열고, 돌려받은 close()로 닫는다.
// 바깥 어두운 부분·× 버튼·Esc·브라우저 뒤로가기로도 닫힌다.
export function openModal(html, onClose) {
  const bg = document.createElement('div')
  bg.className = 'modal-bg'
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button type="button" class="modal-close" aria-label="닫기">×</button>${html}</div>`
  const close = () => closeLayer(bg)
  // 안에서 누른 채 끌어 바깥에서 떼도 click은 바깥에서 난 것으로 잡힌다. 누른 곳도 바깥일 때만 닫는다
  let downOutside = false
  bg.onmousedown = (e) => {
    downOutside = e.target === bg
  }
  // 값을 반환하지 않는다: onclick이 false를 반환하면 브라우저가 기본 동작(폼 제출)을 취소한다
  bg.onclick = (e) => {
    if (downOutside && e.target === bg) close()
  }
  $('.modal-close', bg).onclick = close
  pushLayer(bg, onClose)
  $('input:not([type=checkbox]):not([type=file]), textarea', bg)?.focus()
  return { el: bg, close }
}

// 폼 제출 공통 처리: 중복 제출을 막고, 실패하면 폼 안의 .error에 서버 메시지를 보여준다
export function onSubmit(form, handler) {
  form.onsubmit = async (e) => {
    e.preventDefault()
    const button = $('button:not([type=button])', form)
    if (button) button.disabled = true
    try {
      await handler(new FormData(form))
    } catch (err) {
      const box = $('.error', form)
      if (box) box.textContent = err.message
      else alert(err.message)
    } finally {
      if (button) button.disabled = false
    }
  }
}

// 잠깐 떴다 사라지는 알림
export function toast(html, ms = 2200) {
  document.querySelector('.toast')?.remove()
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.innerHTML = html
  document.body.append(el)
  setTimeout(() => el.remove(), ms)
}

export function timeAgo(ms) {
  const min = Math.floor((Date.now() - ms) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  return `${Math.floor(min / (60 * 24))}일 전`
}

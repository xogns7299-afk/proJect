import { $ } from './dom.js'

// 화면 아래에서 올라오는 입력 창. html을 넣어 열고, 돌려받은 close()로 닫는다.
// 바깥 어두운 부분이나 × 버튼을 눌러도 닫힌다.
export function openSheet(html) {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="sheet"><button class="sheet-close" aria-label="닫기">×</button>${html}</div>`
  const close = () => overlay.remove()
  overlay.onclick = (e) => e.target === overlay && close()
  $('.sheet-close', overlay).onclick = close
  document.body.append(overlay)
  $('input, textarea', overlay)?.focus()
  return { el: overlay, close }
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

export function timeAgo(ms) {
  const min = Math.floor((Date.now() - ms) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  return `${Math.floor(min / (60 * 24))}일 전`
}

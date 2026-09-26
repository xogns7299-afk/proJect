import { $ } from './dom.js'

// 복구 코드 보여 주기 (가입 직후 · 비밀번호 찾기 후 · 내 정보에서 새로 받을 때). 이 화면에서만 볼 수 있다.
export const codeBlockHtml = (code) => `
  <div class="code-block">
    <code data-code>${code}</code>
    <button type="button" class="btn" data-copy-code>복사</button>
  </div>
  <p class="hint">비밀번호를 잊었을 때 로그인 화면의 "비밀번호 찾기"에서 아이디와 이 코드로 새 비밀번호를 정할 수 있어요.
    이 코드는 <b>지금 한 번만</b> 보여요. 캡처하거나 메모해 두세요. 쓰고 나면 새 코드로 바뀌어요.</p>`

export function bindCodeBlock(root, code) {
  $('[data-copy-code]', root).onclick = async (e) => {
    const btn = e.currentTarget // await 뒤에는 e.currentTarget 이 null 이 된다
    try {
      await navigator.clipboard.writeText(code)
      btn.textContent = '복사됨'
    } catch {
      prompt('복구 코드를 복사하세요', code)
    }
  }
}

// 비밀번호 입력 확인: 두 칸이 같은지, 한글이 섞이지 않았는지 (서버도 한 번 더 검사한다)
export function passwordInputProblem(password, confirm) {
  if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다'
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(password)) return '비밀번호에 한글이 들어갔어요. 한/영 전환을 확인해 주세요'
  if (password !== confirm) return '비밀번호 확인이 일치하지 않습니다'
  return ''
}

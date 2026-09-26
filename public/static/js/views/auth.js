import { api } from '../api.js'
import { CHARACTERS, avatarOf } from '../characters.js'
import { $, $$, esc } from '../dom.js'
import { bindCodeBlock, codeBlockHtml, passwordInputProblem } from '../recovery.js'

// 로그인·가입·비밀번호 찾기 화면. 성공하면 onDone()을 부른다.
// 가입하거나 비밀번호를 찾으면 새 복구 코드를 한 번 보여 준 뒤 시작한다.
export function renderAuth(root, onDone) {
  let mode = 'login' // login | signup | reset
  let characterId = CHARACTERS[0].id

  const idInput = `<label>아이디<input name="loginId" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>`
  const newPasswordInputs = (label) => `
    <label>${label}<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
    <label>${label} 확인<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="hint">8자 이상, 영문·숫자로 입력하세요 (한글이 섞이면 로그인할 수 없어요)</p>`

  function draw() {
    const body = {
      login: {
        lead: '로그인하고 공부를 시작하세요',
        fields: `${idInput}<label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>`,
        submit: '로그인',
        links: `<button class="btn text" data-go="signup">처음이에요 · 회원가입</button>
                <button class="btn text" data-go="reset">비밀번호를 잊으셨나요?</button>`,
      },
      signup: {
        lead: '함께 공부할 캐릭터를 골라 시작하세요',
        fields: `${idInput}${newPasswordInputs('비밀번호')}
          <label>닉네임<input name="nickname" maxlength="12" required></label>
          <div class="sub">캐릭터</div>
          <div class="char-grid">${CHARACTERS.map(
            (ch) => `<button type="button" class="char ${ch.id === characterId ? 'on' : ''}" data-id="${esc(ch.id)}">
              <span class="avatar">${avatarOf(ch.id)}</span>${esc(ch.name)}</button>`
          ).join('')}</div>`,
        submit: '가입하기',
        links: `<button class="btn text" data-go="login">이미 계정이 있어요 · 로그인</button>`,
      },
      reset: {
        lead: '아이디와 복구 코드로 새 비밀번호를 정하세요',
        fields: `${idInput}
          <label>복구 코드<input name="recoveryCode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="예: ABCD-2345" required></label>
          <p class="hint">가입할 때 받은 8자리 코드예요. 코드가 없으면 관리자에게 문의하세요.</p>
          ${newPasswordInputs('새 비밀번호')}`,
        submit: '비밀번호 바꾸기',
        links: `<button class="btn text" data-go="login">로그인으로 돌아가기</button>`,
      },
    }[mode]

    root.innerHTML = `
      <div class="auth">
        <img class="logo" src="/static/img/logo.png" alt="proJect">
        <p class="sub center">${body.lead}</p>
        <form class="card">
          ${body.fields}
          <div class="error" role="alert"></div>
          <button class="btn primary big">${body.submit}</button>
        </form>
        <div class="auth-links">${body.links}</div>
      </div>`

    $$('.char', root).forEach((btn) => {
      btn.onclick = () => {
        characterId = btn.dataset.id
        $$('.char', root).forEach((b) => b.classList.toggle('on', b === btn))
      }
    })
    $$('[data-go]', root).forEach(
      (btn) =>
        (btn.onclick = () => {
          mode = btn.dataset.go
          draw()
        })
    )
    $('form', root).onsubmit = async (e) => {
      e.preventDefault()
      const form = new FormData(e.target)
      const submit = $('button.primary', root)
      const error = $('.error', root)
      if (mode !== 'login') {
        const problem = passwordInputProblem(form.get('password'), form.get('confirm'))
        if (problem) return (error.textContent = problem)
      }
      submit.disabled = true
      try {
        if (mode === 'login') {
          await api.post('/auth/login', { loginId: form.get('loginId'), password: form.get('password') })
          return onDone()
        }
        const res =
          mode === 'signup'
            ? await api.post('/auth/signup', { loginId: form.get('loginId'), password: form.get('password'), nickname: form.get('nickname'), characterId })
            : await api.post('/auth/reset-password', { loginId: form.get('loginId'), recoveryCode: form.get('recoveryCode'), newPassword: form.get('password') })
        showCode(res.recoveryCode, mode === 'signup' ? '가입했어요!' : '비밀번호를 바꿨어요!')
      } catch (err) {
        error.textContent = err.message
        submit.disabled = false
      }
    }
  }

  // 새 복구 코드 안내. 저장했다고 체크해야 시작할 수 있다.
  function showCode(code, title) {
    root.innerHTML = `
      <div class="auth">
        <img class="logo" src="/static/img/logo.png" alt="proJect">
        <form class="card">
          <h2>${title} 복구 코드를 저장해 두세요</h2>
          ${codeBlockHtml(code)}
          <label class="check"><input type="checkbox" required> 복구 코드를 저장했어요</label>
          <button class="btn primary big">시작하기</button>
        </form>
      </div>`
    bindCodeBlock(root, code)
    $('form', root).onsubmit = (e) => {
      e.preventDefault()
      onDone()
    }
  }

  draw()
}

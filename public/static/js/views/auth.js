import { api } from '../api.js'
import { CHARACTERS, profileImageOf } from '../characters.js'
import { $, $$, esc } from '../dom.js'

// 로그인·가입 화면. 성공하면 onDone()을 부른다.
export function renderAuth(root, onDone) {
  let mode = 'login'
  let characterId = CHARACTERS[0].id

  function draw() {
    const signup = mode === 'signup'
    root.innerHTML = `
      <div class="auth">
        <img class="logo" src="/static/img/logo.png" alt="proJect">
        <p class="sub center">${signup ? '함께 공부할 캐릭터를 골라 시작하세요' : '로그인하고 공부를 시작하세요'}</p>
        <form class="card">
          <label>아이디<input name="loginId" autocomplete="username" required></label>
          <label>비밀번호<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>
          ${
            signup
              ? `<label>닉네임<input name="nickname" maxlength="12" required></label>
                 <div class="sub">캐릭터</div>
                 <div class="char-grid">${CHARACTERS.map(
                   (ch) => `<button type="button" class="char ${ch.id === characterId ? 'on' : ''}" data-id="${esc(ch.id)}">
                     <span class="avatar">${profileImageOf(ch.id)}</span>${esc(ch.name)}</button>`
                 ).join('')}</div>`
              : ''
          }
          <div class="error" role="alert"></div>
          <button class="btn primary big">${signup ? '가입하기' : '로그인'}</button>
        </form>
        <button class="btn text" data-switch>${signup ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 회원가입'}</button>
      </div>`

    $$('.char', root).forEach((btn) => {
      btn.onclick = () => {
        characterId = btn.dataset.id
        $$('.char', root).forEach((b) => b.classList.toggle('on', b === btn))
      }
    })
    $('[data-switch]', root).onclick = () => {
      mode = signup ? 'login' : 'signup'
      draw()
    }
    $('form', root).onsubmit = async (e) => {
      e.preventDefault()
      const form = new FormData(e.target)
      const submit = $('button.primary', root)
      submit.disabled = true
      try {
        await api.post(signup ? '/auth/signup' : '/auth/login', {
          loginId: form.get('loginId'),
          password: form.get('password'),
          nickname: form.get('nickname'),
          characterId,
        })
        onDone()
      } catch (err) {
        $('.error', root).textContent = err.message
        submit.disabled = false
      }
    }
  }

  draw()
}

import { api } from './api.js'
import { $, esc } from './dom.js'
import { themeIcon, toggleTheme } from './theme.js'
import { renderAuth } from './views/auth.js'
import { renderCalendar } from './views/calendar.js'
import { renderHome } from './views/home.js'
import { renderRecords } from './views/records.js'
import { renderStudy } from './views/study.js'
import { renderTodo } from './views/todo.js'

// 화면 목록. 새 화면은 views/에 파일을 만들고 여기에 연결한다.
// render(main, ctx): main은 화면을 그릴 자리, ctx.me는 내 정보, ctx.refreshMe()는 경험치가 바뀐 뒤 내 정보를 다시 읽는다.
const ROUTES = {
  home: { title: '홈', tab: '홈', render: renderHome },
  records: { title: '공부 기록', tab: '기록', render: renderRecords },
  todo: { title: '할 일', tab: '할 일', render: renderTodo },
  calendar: { title: '캘린더', tab: '캘린더', render: renderCalendar },
  study: { title: '스터디', tab: '스터디', render: renderStudy },
}

const root = document.getElementById('app')
const ctx = { me: null, refreshMe }

async function refreshMe() {
  ctx.me = await api.get('/auth/me')
  return ctx.me
}

function currentRoute() {
  const name = location.hash.replace('#/', '')
  return ROUTES[name] ? name : 'home'
}

function drawShell() {
  const name = currentRoute()
  root.innerHTML = `
    <div class="app">
      <header class="top">
        <h1>${esc(ROUTES[name].title)}</h1>
        <div class="top-actions">
          <button class="btn icon" data-theme-toggle aria-label="다크/라이트 모드 전환">${themeIcon()}</button>
          <button class="btn small" data-logout>로그아웃</button>
        </div>
      </header>
      <main></main>
      <nav class="tabs">${Object.entries(ROUTES)
        .map(([key, r]) => `<a href="#/${key}" class="${key === name ? 'on' : ''}">${esc(r.tab)}</a>`)
        .join('')}</nav>
    </div>`

  $('[data-theme-toggle]', root).onclick = (e) => {
    toggleTheme()
    e.currentTarget.textContent = themeIcon()
  }
  $('[data-logout]', root).onclick = async () => {
    await api.post('/auth/logout')
    start()
  }
  ROUTES[name].render($('main', root), ctx)
}

async function start() {
  try {
    await refreshMe()
  } catch {
    ctx.me = null
  }
  if (ctx.me) drawShell()
  else renderAuth(root, start)
}

window.addEventListener('hashchange', () => ctx.me && drawShell())
window.addEventListener('auth:expired', start)
start()

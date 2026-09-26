import { api } from './api.js'
import { avatarOf } from './characters.js'
import { $, $$, esc } from './dom.js'
import { setBaseTitle, setLive } from './live.js'
import { themeIcon, toggleTheme } from './theme.js'
import { renderAuth } from './views/auth.js'
import { renderCalendar } from './views/calendar.js'
import { renderHome } from './views/home.js'
import { openProfile } from './views/profile.js'
import { renderRecords } from './views/records.js'
import { renderStudy } from './views/study.js'
import { openTimer } from './views/timer.js'
import { renderTodo } from './views/todo.js'

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

// 화면 목록. 새 화면은 views/에 파일을 만들고 여기에 연결한다.
// render(main, ctx): main은 화면을 그릴 자리, ctx.me는 내 정보, ctx.refreshMe()는 경험치가 바뀐 뒤 내 정보를 다시 읽는다.
const ROUTES = {
  home: { title: '홈', tab: '홈', render: renderHome, icon: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>') },
  records: { title: '공부 기록', tab: '기록', render: renderRecords, icon: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>') },
  todo: { title: '할 일', tab: '할 일', render: renderTodo, icon: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>') },
  calendar: { title: '캘린더', tab: '캘린더', render: renderCalendar, icon: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>') },
  study: { title: '스터디', tab: '스터디', render: renderStudy, icon: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>') },
}

const root = document.getElementById('app')
const ctx = { me: null, refreshMe, redraw: () => drawShell() }

async function refreshMe() {
  ctx.me = await api.get('/auth/me')
  paintMe()
  return ctx.me
}

function currentRoute() {
  const name = location.hash.replace('#/', '')
  return ROUTES[name] ? name : 'home'
}

const todayLabel = () =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

// 왼쪽 메뉴·상단의 내 캐릭터와 레벨
function paintMe() {
  const me = ctx.me
  if (!me) return
  $$('[data-me-avatar]', root).forEach((el) => (el.innerHTML = avatarOf(me.characterId)))
  const chip = $('[data-me-text]', root)
  if (chip) chip.innerHTML = `<b class="block ellipsis">${esc(me.nickname)}</b><span class="lv">Lv.${me.level}</span> <span class="sub">· 내 정보</span>`
}

function drawShell() {
  const name = currentRoute()
  const links = (label) =>
    Object.entries(ROUTES)
      .map(([key, r]) => `<a href="#/${key}" class="${key === name ? 'on' : ''}"${key === name ? ' aria-current="page"' : ''}>${r.icon}${esc(label(r))}</a>`)
      .join('')
  root.innerHTML = `
    <div class="shell">
      <aside class="side">
        <a class="brand" href="#/home"><img src="/static/img/favicon.png" alt=""><b>proJect</b></a>
        <nav class="nav" aria-label="메뉴">${links((r) => r.title)}</nav>
        <button class="side-live" data-live hidden title="타이머 열기"><span></span><b></b></button>
        <div class="side-foot">
          <button class="me-chip" data-profile title="내 정보"><span class="avatar" data-me-avatar></span><span class="grow" data-me-text></span></button>
          <button class="btn icon" data-theme-toggle aria-label="다크/라이트 모드 전환" title="다크/라이트 모드">${themeIcon()}</button>
        </div>
      </aside>
      <div class="page">
        <header class="page-top">
          <h1>${esc(ROUTES[name].title)}</h1>
          <span class="sub desktop-only">${todayLabel()}</span>
          <div class="top-actions mobile-only">
            ${name === 'home' ? '' : '<button class="live-pill" data-live hidden aria-label="진행 중인 타이머 열기"><span></span><b></b></button>'}
            <button class="btn icon" data-theme-toggle aria-label="다크/라이트 모드 전환">${themeIcon()}</button>
            <button class="btn icon" data-profile aria-label="내 정보"><span class="avatar" data-me-avatar style="width:32px;height:32px"></span></button>
          </div>
        </header>
        <main class="view"></main>
      </div>
      <nav class="tabs" aria-label="메뉴">${links((r) => r.tab)}</nav>
    </div>`

  paintMe()
  $$('[data-theme-toggle]', root).forEach(
    (btn) =>
      (btn.onclick = () => {
        toggleTheme()
        $$('[data-theme-toggle]', root).forEach((b) => (b.textContent = themeIcon()))
      })
  )
  $$('[data-profile]', root).forEach((btn) => (btn.onclick = () => openProfile(ctx, logout)))
  $$('[data-live]', root).forEach((btn) => (btn.onclick = () => openTimer(ctx, () => drawShell())))
  setBaseTitle(`${ROUTES[name].title} · proJect`)
  ROUTES[name].render($('main', root), ctx)
}

async function logout() {
  await api.post('/auth/logout')
  setLive(null)
  start()
}

async function start() {
  try {
    await refreshMe()
  } catch {
    ctx.me = null
  }
  if (!ctx.me) {
    setBaseTitle('proJect')
    return renderAuth(root, start)
  }
  drawShell()
  // 홈이 아닌 화면에서도 진행 중인 타이머가 보이도록 한 번 읽어 둔다. 홈은 스스로 읽는다.
  // 8시간을 넘겨 자동 종료된 결과는 서버가 한 번만 알려주므로 여기서 받으면 바로 회고 화면을 띄운다.
  if (currentRoute() !== 'home')
    api
      .get('/timer')
      .then((res) => {
        setLive(res.timer)
        if (res.autoStopped) openTimer(ctx, () => drawShell(), res)
      })
      .catch(() => {})
}

window.addEventListener('hashchange', () => ctx.me && drawShell())
window.addEventListener('auth:expired', start)
start()

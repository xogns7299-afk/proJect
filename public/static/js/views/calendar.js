import { api } from '../api.js'
import { $, $$, esc } from '../dom.js'
import { onSubmit, openSheet } from '../ui.js'

const pad = (n) => String(n).padStart(2, '0')
// 기기 시간대와 상관없이 한국시간 기준의 오늘
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

export function renderCalendar(main) {
  const today = todayKst()
  let [year, month] = today.split('-').map(Number)
  let selected = today
  let events = []

  main.innerHTML = `
    <div class="card">
      <div class="card-head">
        <button class="btn icon" data-prev aria-label="이전 달">‹</button>
        <h2 data-month></h2>
        <button class="btn icon" data-next aria-label="다음 달">›</button>
      </div>
      <div class="cal" data-grid></div>
    </div>
    <div class="card">
      <div class="card-head"><h2 data-day-title></h2><button class="btn" data-add>+ 일정</button></div>
      <ul class="list" data-day-list></ul>
    </div>`

  const monthKey = () => `${year}-${pad(month)}`

  async function load() {
    events = await api.get(`/events?month=${monthKey()}`)
    draw()
  }

  function draw() {
    $('[data-month]', main).textContent = `${year}년 ${month}월`
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const counts = {}
    events.forEach((e) => (counts[e.date] = (counts[e.date] || 0) + 1))

    let html = ['일', '월', '화', '수', '목', '금', '토'].map((d) => `<div class="dow">${d}</div>`).join('')
    html += '<div></div>'.repeat(firstDay)
    for (let d = 1; d <= lastDate; d++) {
      const date = `${monthKey()}-${pad(d)}`
      const cls = [date === today && 'today', date === selected && 'sel'].filter(Boolean).join(' ')
      html += `<button data-date="${date}" class="${cls}">${d}<span class="dots">${'<i></i>'.repeat(Math.min(counts[date] || 0, 3))}</span></button>`
    }
    $('[data-grid]', main).innerHTML = html
    $$('[data-date]', main).forEach((b) => (b.onclick = () => ((selected = b.dataset.date), draw())))

    const [, m, d] = selected.split('-').map(Number)
    $('[data-day-title]', main).textContent = `${m}월 ${d}일${selected === today ? ' · 오늘' : ''}`
    const list = events.filter((e) => e.date === selected)
    $('[data-day-list]', main).innerHTML = list.length
      ? list
          .map(
            (e) => `<li><button class="row-btn" data-edit="${e.id}">
              <b>${esc(e.startTime || '종일')}${e.endTime ? '~' + esc(e.endTime) : ''}</b>
              <span class="grow">${esc(e.title)}${e.memo ? `<span class="sub block">${esc(e.memo)}</span>` : ''}</span>
            </button></li>`
          )
          .join('')
      : '<li class="sub">일정이 없습니다</li>'
    $$('[data-edit]', main).forEach((b) => (b.onclick = () => openForm(events.find((e) => e.id === Number(b.dataset.edit)))))
  }

  function move(delta) {
    month += delta
    if (month < 1) (month = 12), year--
    if (month > 12) (month = 1), year++
    // 다른 달로 가면 그 달 1일을, 이번 달로 돌아오면 오늘을 고른다
    selected = monthKey() === today.slice(0, 7) ? today : `${monthKey()}-01`
    load()
  }

  function openForm(event) {
    const sheet = openSheet(`
      <form class="form">
        <h2>${event ? '일정 수정' : '일정 추가'}</h2>
        <label>제목<input name="title" maxlength="100" value="${esc(event?.title)}" required></label>
        <label>날짜<input name="date" type="date" value="${esc(event?.date || selected)}" required></label>
        <div class="row">
          <label class="grow">시작 (선택)<input name="startTime" type="time" value="${esc(event?.startTime)}"></label>
          <label class="grow">종료 (선택)<input name="endTime" type="time" value="${esc(event?.endTime)}"></label>
        </div>
        <label>메모 (선택)<textarea name="memo" rows="2" maxlength="500">${esc(event?.memo)}</textarea></label>
        <div class="error" role="alert"></div>
        <div class="row">
          ${event ? '<button type="button" class="btn danger" data-delete>삭제</button>' : ''}
          <button class="btn primary grow">저장</button>
        </div>
      </form>`)

    onSubmit($('form', sheet.el), async (form) => {
      const data = Object.fromEntries(form)
      if (event) await api.put(`/events/${event.id}`, data)
      else await api.post('/events', data)
      sheet.close()
      // 저장한 날짜가 보이도록 그 달·그 날로 이동
      ;[year, month] = data.date.split('-').map(Number)
      selected = data.date
      load()
    })
    const del = $('[data-delete]', sheet.el)
    if (del)
      del.onclick = async () => {
        await api.del(`/events/${event.id}`)
        sheet.close()
        load()
      }
  }

  $('[data-prev]', main).onclick = () => move(-1)
  $('[data-next]', main).onclick = () => move(1)
  $('[data-add]', main).onclick = () => openForm(null)
  load()
}

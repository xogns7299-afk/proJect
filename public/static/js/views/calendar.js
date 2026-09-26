import { api } from '../api.js'
import { $, $$, esc } from '../dom.js'
import { onSubmit, openModal } from '../ui.js'

const pad = (n) => String(n).padStart(2, '0')
// 기기 시간대와 상관없이 한국시간 기준의 오늘
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const MAX_IN_CELL = 2

// 캘린더: 큰 달력(칸 안에 일정 제목) | 고른 날의 일정
export function renderCalendar(main) {
  const today = todayKst()
  let [year, month] = today.split('-').map(Number)
  let selected = today
  let events = []

  main.innerHTML = `
    <div class="cols wide-left">
      <div class="card">
        <div class="card-head">
          <button class="btn icon" data-prev aria-label="이전 달" title="이전 달">‹</button>
          <h2 data-month></h2>
          <button class="btn icon" data-next aria-label="다음 달" title="다음 달">›</button>
        </div>
        <div class="calw" data-grid></div>
      </div>
      <div class="card">
        <div class="card-head"><h2 data-day-title></h2><button class="btn" data-add>+ 일정</button></div>
        <ul class="list" data-day-list></ul>
      </div>
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
    const byDate = {}
    events.forEach((e) => (byDate[e.date] ||= []).push(e))
    const weekend = (w) => (w === 0 ? 'sun' : w === 6 ? 'sat' : '')

    let html = ['일', '월', '화', '수', '목', '금', '토'].map((d, i) => `<div class="dow ${weekend(i)}">${d}</div>`).join('')
    html += '<div class="blank"></div>'.repeat(firstDay)
    for (let d = 1; d <= lastDate; d++) {
      const date = `${monthKey()}-${pad(d)}`
      const list = byDate[date] || []
      const cls = [weekend((firstDay + d - 1) % 7), date === today && 'today', date === selected && 'sel', list.length && 'has'].filter(Boolean).join(' ')
      html += `<button class="day ${cls}" data-date="${date}" aria-label="${month}월 ${d}일${list.length ? `, 일정 ${list.length}개` : ''}">
        <span class="n">${d}</span>
        ${list.slice(0, MAX_IN_CELL).map((e) => `<span class="ev" title="${esc(e.title)}">${esc(e.title)}</span>`).join('')}
        ${list.length > MAX_IN_CELL ? `<span class="more">+${list.length - MAX_IN_CELL}개</span>` : ''}
      </button>`
    }
    html += '<div class="blank"></div>'.repeat((7 - ((firstDay + lastDate) % 7)) % 7)
    $('[data-grid]', main).innerHTML = html
    $$('[data-date]', main).forEach((b) => (b.onclick = () => ((selected = b.dataset.date), draw())))

    const [, m, d] = selected.split('-').map(Number)
    $('[data-day-title]', main).textContent = `${m}월 ${d}일${selected === today ? ' · 오늘' : ''}`
    const list = byDate[selected] || []
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
    const modal = openModal(`
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
        <div class="modal-foot" style="justify-content:${event ? 'space-between' : 'flex-end'}">
          ${event ? '<button type="button" class="btn text danger-text" data-delete>삭제</button>' : ''}
          <button class="btn primary">저장</button>
        </div>
      </form>`)

    onSubmit($('form', modal.el), async (form) => {
      const data = Object.fromEntries(form)
      if (data.startTime && data.endTime && data.endTime < data.startTime) throw new Error('종료 시각이 시작 시각보다 빨라요')
      if (event) await api.put(`/events/${event.id}`, data)
      else await api.post('/events', data)
      modal.close()
      // 저장한 날짜가 보이도록 그 달·그 날로 이동
      ;[year, month] = data.date.split('-').map(Number)
      selected = data.date
      load()
    })
    const del = $('[data-delete]', modal.el)
    if (del)
      del.onclick = async () => {
        await api.del(`/events/${event.id}`)
        modal.close()
        load()
      }
  }

  $('[data-prev]', main).onclick = () => move(-1)
  $('[data-next]', main).onclick = () => move(1)
  $('[data-add]', main).onclick = () => openForm(null)
  load()
}

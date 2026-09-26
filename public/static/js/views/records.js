import { api } from '../api.js'
import { $, $$, esc, fmtClock, fmtDuration } from '../dom.js'
import { onSubmit, openModal } from '../ui.js'
import { reviewFieldsHtml } from './timer.js'
import { bindPhotoRow, photoRowHtml } from '../photo.js'

const kstDateTime = (ms) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))

// 기록: 과목별 공부시간 · 과목 관리 | 전체 기록(회고 이어 쓰기, 삭제)
export async function renderRecords(main, ctx) {
  let filter = 0 // 0 = 전체 과목

  async function draw() {
    const [stats, subjects, records] = await Promise.all([api.get('/records/stats'), api.get('/subjects'), api.get('/records')])
    if (!main.isConnected) return
    const max = Math.max(1, ...stats.bySubject.map((s) => s.totalSec))
    const shown = filter ? records.filter((r) => r.subjectId === filter) : records

    main.innerHTML = `
      <div class="cols narrow-left">
        <div class="col">
          <div class="card">
            <div class="card-head"><h2>과목별 공부시간</h2><span class="sub">전체 ${fmtDuration(stats.totalSec)} · ${stats.recordCount}건</span></div>
            ${
              stats.bySubject.length
                ? stats.bySubject
                    .map(
                      (s) => `<div class="sbar"><div class="sbar-head"><span>${esc(s.subject)}</span><span class="sub">${fmtDuration(s.totalSec)}</span></div>
                        <div class="bar"><div class="bar-fill" style="width:${(s.totalSec / max) * 100}%"></div></div></div>`
                    )
                    .join('')
                : '<p class="sub">과목을 등록하고 공부를 기록하면 여기에 쌓여요.</p>'
            }
          </div>

          <div class="card">
            <div class="card-head"><h2>과목 관리</h2><span class="sub">눌러서 이름 수정·삭제</span></div>
            <div class="chips">
              ${subjects.map((s) => `<button class="chip" data-subject="${s.id}">${esc(s.name)}</button>`).join('')}
              <button class="chip dashed" data-subject="0">＋ 과목 추가</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>공부 기록</h2><span class="sub">${shown.length}건 · 눌러서 회고 쓰기·사진·삭제</span></div>
          <div class="chips small">
            <button class="chip ${filter ? '' : 'on'}" data-filter="0">전체</button>
            ${stats.bySubject.map((s) => `<button class="chip ${filter === s.subjectId ? 'on' : ''}" data-filter="${s.subjectId}">${esc(s.subject)}</button>`).join('')}
          </div>
          <ul class="list" style="margin-top:14px">
            ${
              shown.length
                ? shown
                    .map(
                      (r) => `<li><button class="row-btn" data-record="${r.id}">
                        <span class="grow">
                          <span class="tag">${esc(r.subject)}</span> <span class="sub">${kstDateTime(r.startedAt)}</span>
                          <span class="block ${r.memo ? '' : 'sub'}">${esc(r.memo) || '회고 미작성 — 눌러서 쓰기'}</span>
                        </span>
                        <b>${fmtDuration(r.durationSec)}</b>
                      </button></li>`
                    )
                    .join('')
                : '<li class="sub">기록이 없습니다</li>'
            }
          </ul>
        </div>
      </div>`

    $$('[data-filter]', main).forEach((b) => (b.onclick = () => ((filter = Number(b.dataset.filter)), draw())))
    $$('[data-subject]', main).forEach((b) => (b.onclick = () => openSubject(subjects.find((s) => s.id === Number(b.dataset.subject)))))
    $$('[data-record]', main).forEach((b) => (b.onclick = () => openRecord(records.find((r) => r.id === Number(b.dataset.record)))))
  }

  function openSubject(subject) {
    const modal = openModal(`
      <form class="form">
        <h2>${subject ? '과목 수정' : '과목 추가'}</h2>
        <label>과목 이름<input name="name" maxlength="20" value="${esc(subject?.name)}" placeholder="예: 수학, 토익, 전공" required></label>
        ${subject ? '<p class="hint">삭제해도 이 과목으로 남긴 과거 기록은 그대로 남습니다.</p>' : ''}
        <div class="error" role="alert"></div>
        <div class="modal-foot" style="justify-content:${subject ? 'space-between' : 'flex-end'}">
          ${subject ? '<button type="button" class="btn text danger-text" data-delete>삭제</button>' : ''}
          <button class="btn primary">저장</button>
        </div>
      </form>`)
    onSubmit($('form', modal.el), async (form) => {
      const data = { name: form.get('name') }
      if (subject) await api.patch(`/subjects/${subject.id}`, data)
      else await api.post('/subjects', data)
      modal.close()
      draw()
    })
    const del = $('[data-delete]', modal.el)
    if (del)
      del.onclick = async () => {
        await api.del(`/subjects/${subject.id}`)
        modal.close()
        draw()
      }
  }

  function openRecord(r) {
    const modal = openModal(`
      <form class="form">
        <h2>${esc(r.subject)} · ${fmtDuration(r.durationSec)}</h2>
        <p class="sub">${kstDateTime(r.startedAt)} 시작 · 공부시간 ${fmtClock(r.durationSec)} · 휴식 ${r.pauseCount}회 ${fmtClock(r.pausedSec)}</p>
        ${photoRowHtml('오공시 사진', 'start', r.startPhoto && `/api/photos/${r.startPhoto}`)}
        ${photoRowHtml('오공완 사진', 'end', r.endPhoto && `/api/photos/${r.endPhoto}`)}
        ${reviewFieldsHtml(r)}
        <div class="error" role="alert"></div>
        <div class="modal-foot" style="justify-content:space-between">
          <button type="button" class="btn text danger-text" data-delete>기록 삭제</button>
          <button class="btn primary">회고 저장</button>
        </div>
      </form>`)
    bindPhotoRow(modal.el, 'start', r.id)
    bindPhotoRow(modal.el, 'end', r.id)
    onSubmit($('form', modal.el), async (form) => {
      await api.patch(`/records/${r.id}`, Object.fromEntries(form))
      modal.close()
      draw()
    })
    $('[data-delete]', modal.el).onclick = async () => {
      if (!confirm('이 기록을 삭제할까요? 공부시간 합계와 이 기록으로 받은 경험치도 함께 사라집니다.')) return
      await api.del(`/records/${r.id}`)
      modal.close()
      ctx.refreshMe().catch(() => {})
      draw()
    }
  }

  main.innerHTML = '<div class="card sub">불러오는 중…</div>'
  draw()
}

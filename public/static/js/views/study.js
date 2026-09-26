import { api } from '../api.js'
import { avatarOf } from '../characters.js'
import { $, $$, esc, fmtDuration } from '../dom.js'
import { onSubmit, openModal, timeAgo } from '../ui.js'

const LAST_STUDY = 'lastStudyId'
const remember = (id) => {
  try {
    localStorage.setItem(LAST_STUDY, id)
  } catch {}
}
const remembered = () => {
  try {
    return Number(localStorage.getItem(LAST_STUDY))
  } catch {
    return 0
  }
}

export async function renderStudy(main) {
  let studies = []
  let currentId = 0

  async function loadList(selectId) {
    studies = await api.get('/studies')
    currentId = [selectId, currentId, remembered()].find((id) => studies.some((s) => s.id === id)) || studies[0]?.id || 0
    if (currentId) remember(currentId)
    await draw()
  }

  async function draw() {
    if (!studies.length) {
      main.innerHTML = `
        <div class="one"><div class="card center empty">
          <div class="empty-icon">👥</div>
          <h2>아직 가입한 스터디가 없어요</h2>
          <p class="sub">스터디에 들어가면 서로의 공부 기록과 목표 달성 현황을 볼 수 있어요.<br>내 기록은 따로 올리지 않아도 자동으로 공유됩니다.</p>
          <button class="btn primary big" data-join>초대 코드로 가입</button>
          <button class="btn big" data-create>새 스터디 만들기</button>
        </div></div>`
      bindJoinCreate()
      return
    }

    main.innerHTML = `
      <div class="chips" style="margin-bottom:16px">
        ${studies.map((s) => `<button class="chip ${s.id === currentId ? 'on' : ''}" data-study="${s.id}">${esc(s.name)}</button>`).join('')}
        <button class="chip" data-join>+ 가입</button>
        <button class="chip" data-create>+ 만들기</button>
      </div>
      <div data-body><div class="card sub">불러오는 중…</div></div>`
    $$('[data-study]', main).forEach((b) => (b.onclick = () => ((currentId = Number(b.dataset.study)), remember(currentId), draw())))
    bindJoinCreate()

    const [study, feed] = await Promise.all([api.get(`/studies/${currentId}`), api.get(`/studies/${currentId}/feed`)])
    drawBody(study, feed)
  }

  function drawBody(study, feed) {
    const body = $('[data-body]', main)
    const studyingCount = study.members.filter((m) => m.studying).length
    body.innerHTML = `
      <div class="cols narrow-left">
      <div class="col">
      <div class="card">
        <div class="card-head">
          <h2>멤버 · 이번 주</h2>
          <span class="sub">${studyingCount ? `<span class="tag live">${studyingCount}명 공부 중</span>` : `${study.members.length}명`}</span>
        </div>
        <ul class="list">
          ${study.members
            .map(
              (m, i) => `<li>
                <button class="row-btn" data-member="${m.id}" aria-expanded="false">
                  <span class="rank">${i + 1}</span>
                  <span class="avatar sm">${avatarOf(m.characterId)}</span>
                  <span class="grow">
                    <b>${esc(m.nickname)}</b>${m.id === study.myId ? ' <span class="sub">(나)</span>' : ''} <span class="lv">Lv.${m.level}</span>
                    ${m.studying ? `<span class="tag live">${esc(m.studyingSubject)} 공부 중</span>` : ''}
                    <span class="goal-line">
                      <span class="bar"><span class="bar-fill" style="width:${m.achievement}%"></span></span>
                      <span class="sub">${m.goalTotal ? `목표 ${m.goalDone}/${m.goalTotal}` : '목표 없음'}</span>
                    </span>
                  </span>
                  <b>${fmtDuration(m.weekSec)}</b>
                </button>
                <div class="member-goals" data-goals="${m.id}" hidden></div>
              </li>`
            )
            .join('')}
        </ul>
      </div>

      <div class="card">
        <div class="card-head"><h2>${esc(study.name)}</h2><span class="sub">${study.role === 'owner' ? '스터디장' : '멤버'}</span></div>
        ${study.description ? `<p class="sub">${esc(study.description)}</p>` : ''}
        <div class="invite">
          <span class="sub">초대 코드</span> <code>${esc(study.inviteCode)}</code>
          <button class="btn" data-copy>복사</button>
        </div>
        <button class="btn text danger-text" data-exit>${study.role === 'owner' ? '스터디 삭제' : '스터디 나가기'}</button>
      </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>공부 기록</h2><span class="sub">최근 50건</span></div>
        <ul class="list" data-feed>
          ${feed.length ? feed.map((r) => feedItem(r, study.myId)).join('') : '<li class="sub">아직 공부 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!</li>'}
        </ul>
      </div>
      </div>`

    $$('[data-member]', body).forEach((btn) => (btn.onclick = () => toggleGoals(btn)))
    $$('[data-cheer]', body).forEach((btn) => (btn.onclick = () => cheer(btn)))
    $$('[data-comments-toggle]', body).forEach((btn) => (btn.onclick = () => toggleComments(btn, study.myId)))

    $('[data-copy]', body).onclick = async (e) => {
      try {
        await navigator.clipboard.writeText(study.inviteCode)
        e.currentTarget.textContent = '복사됨'
      } catch {
        prompt('초대 코드를 복사하세요', study.inviteCode)
      }
    }
    $('[data-exit]', body).onclick = async () => {
      const owner = study.role === 'owner'
      if (!confirm(owner ? `'${study.name}' 스터디를 삭제할까요? 멤버 모두에게서 사라지며 되돌릴 수 없습니다.` : `'${study.name}' 스터디에서 나갈까요? 내 공부 기록은 그대로 남습니다.`)) return
      try {
        await (owner ? api.del(`/studies/${study.id}`) : api.post(`/studies/${study.id}/leave`))
        currentId = 0
        loadList()
      } catch (err) {
        alert(err.message)
      }
    }
  }

  const feedItem = (r, myId) => `
    <li class="feed-item">
      <div class="feed-top">
        <span class="avatar sm">${avatarOf(r.characterId)}</span>
        <span class="grow">
          <b>${esc(r.nickname)}</b> <span class="lv">Lv.${r.level}</span>
          <span class="sub block">${timeAgo(r.startedAt)} · <span class="tag">${esc(r.subject)}</span></span>
        </span>
        <b>${fmtDuration(r.durationSec)}</b>
      </div>
      ${r.memo ? `<p class="feed-memo">${esc(r.memo)}</p>` : ''}
      ${r.startPhoto || r.endPhoto ? `<div class="photos feed-photos" style="margin-left:46px">${[r.startPhoto, r.endPhoto].filter(Boolean).map((k) => `<img src="/api/photos/${esc(k)}" alt="인증 사진" loading="lazy">`).join('')}</div>` : ''}
      <div class="feed-actions">
        <button class="react ${r.cheered ? 'on' : ''}" data-cheer="${r.id}" ${r.userId === myId ? 'disabled title="내 기록은 응원할 수 없어요"' : ''}>👏 <span>${r.cheerCount}</span></button>
        <button class="react" data-comments-toggle="${r.id}">💬 <span>${r.commentCount}</span></button>
      </div>
      <div class="comments" data-comments="${r.id}" hidden></div>
    </li>`

  async function toggleGoals(btn) {
    const box = $(`[data-goals="${btn.dataset.member}"]`, main)
    box.hidden = !box.hidden
    btn.setAttribute('aria-expanded', String(!box.hidden))
    if (box.hidden || box.dataset.loaded) return
    const { items } = await api.get(`/studies/${currentId}/members/${btn.dataset.member}/goals`)
    box.dataset.loaded = '1'
    box.innerHTML = items.length
      ? `<ul>${items.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? '✅' : '⬜'} ${esc(g.title)}</li>`).join('')}</ul>`
      : '<p class="sub">이번 주 목표를 아직 쓰지 않았어요</p>'
  }

  async function cheer(btn) {
    btn.disabled = true
    try {
      const res = await api.post(`/studies/${currentId}/feed/${btn.dataset.cheer}/cheer`)
      btn.classList.toggle('on', res.cheered)
      $('span', btn).textContent = res.cheerCount
    } catch (err) {
      alert(err.message)
    } finally {
      btn.disabled = false
    }
  }

  async function toggleComments(btn, myId) {
    const recordId = btn.dataset.commentsToggle
    const box = $(`[data-comments="${recordId}"]`, main)
    box.hidden = !box.hidden
    if (box.hidden) return
    const path = `/studies/${currentId}/feed/${recordId}/comments`

    const drawComments = (comments) => {
      $('span', btn).textContent = comments.length
      box.innerHTML = `
        <ul>${comments
          .map(
            (cm) => `<li>
              <span class="avatar xs">${avatarOf(cm.characterId)}</span>
              <span class="grow"><b>${esc(cm.nickname)}</b> <span class="sub">${timeAgo(cm.createdAt)}</span><span class="block">${esc(cm.body)}</span></span>
              ${cm.userId === myId ? `<button class="btn icon" data-del="${cm.id}" aria-label="댓글 삭제" title="삭제">×</button>` : ''}
            </li>`
          )
          .join('')}</ul>
        <form class="add"><input name="body" maxlength="300" placeholder="응원의 한마디" required><button class="btn">등록</button></form>`
      $$('[data-del]', box).forEach(
        (del) =>
          (del.onclick = async () => {
            await api.del(`/studies/${currentId}/comments/${del.dataset.del}`)
            drawComments(comments.filter((cm) => cm.id !== Number(del.dataset.del)))
          })
      )
      onSubmit($('form', box), async (form) => {
        const created = await api.post(path, { body: form.get('body') })
        drawComments([...comments, created])
      })
    }
    drawComments(await api.get(path))
  }

  function bindJoinCreate() {
    $('[data-join]', main).onclick = () => {
      const sheet = openModal(`
        <form class="form">
          <h2>초대 코드로 가입</h2>
          <label>초대 코드<input name="inviteCode" maxlength="8" autocapitalize="characters" placeholder="예: AB12CD34" required></label>
          <div class="error" role="alert"></div>
          <div class="modal-foot"><button class="btn primary">가입하기</button></div>
        </form>`)
      onSubmit($('form', sheet.el), async (form) => {
        const study = await api.post('/studies/join', { inviteCode: form.get('inviteCode') })
        sheet.close()
        loadList(study.id)
      })
    }
    $('[data-create]', main).onclick = () => {
      const sheet = openModal(`
        <form class="form">
          <h2>새 스터디 만들기</h2>
          <label>스터디 이름<input name="name" maxlength="30" required></label>
          <label>소개 (선택)<input name="description" maxlength="200"></label>
          <div class="error" role="alert"></div>
          <p class="hint">만든 뒤 초대 코드를 멤버에게 알려주세요</p>
          <div class="modal-foot"><button class="btn primary">만들기</button></div>
        </form>`)
      onSubmit($('form', sheet.el), async (form) => {
        const study = await api.post('/studies', Object.fromEntries(form))
        sheet.close()
        loadList(study.id)
      })
    }
  }

  main.innerHTML = '<div class="card sub">불러오는 중…</div>'
  loadList()
}

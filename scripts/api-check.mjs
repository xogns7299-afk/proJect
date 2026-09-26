// docs/기능명세.md 8번 검증 시나리오를 실제 서버에 대고 확인한다.
// 사용법: 개발 서버(npm run dev)를 켠 상태에서  npm run check:api
// 매번 새 계정을 만들기 때문에 여러 번 돌려도 된다. 로컬 DB에만 쓴다.
import { execSync } from 'node:child_process'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const run = Date.now().toString(36)
let failed = 0

function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : '  → ' + detail}`)
  if (!ok) failed++
}

// 계정별로 쿠키를 따로 들고 다니는 간단한 클라이언트
function client() {
  let cookie = ''
  return async (method, path, data) => {
    const res = await fetch(BASE + '/api' + path, {
      method,
      headers: { ...(cookie && { cookie }), ...(data && { 'content-type': 'application/json' }) },
      body: data && JSON.stringify(data),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }
}

// 타이머를 1분 이상 기다리지 않으려고 로컬 DB의 시작 시각을 과거로 옮긴다
function backdate(sessionId, seconds) {
  execSync(`npx wrangler d1 execute DB --local --command "UPDATE study_sessions SET started_at = started_at - ${seconds * 1000} WHERE id = ${sessionId}"`, { stdio: 'ignore' })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function signup(name) {
  const c = client()
  const res = await c('POST', '/auth/signup', { loginId: `${name}_${run}`, password: 'test-password-1', nickname: name, characterId: 'chick' })
  if (res.status !== 201) throw new Error(`가입 실패: ${JSON.stringify(res.body)}`)
  return c
}

console.log(`대상: ${BASE}\n`)

console.log('로그인')
const anon = client()
check('로그인 없이 API 호출 → 401', (await anon('GET', '/todos')).status === 401)
const A = await signup('a')
const B = await signup('b')
const C = await signup('c')
check('같은 아이디로 다시 가입 → 409', (await client()('POST', '/auth/signup', { loginId: `a_${run}`, password: 'test-password-1', nickname: 'x', characterId: 'chick' })).status === 409)
check('틀린 비밀번호 → 401', (await client()('POST', '/auth/login', { loginId: `a_${run}`, password: 'wrong-password' })).status === 401)
const A2 = client()
check('맞는 비밀번호로 로그인', (await A2('POST', '/auth/login', { loginId: `a_${run}`, password: 'test-password-1' })).status === 200)
check('재로그인 후 내 정보 조회', (await A2('GET', '/auth/me')).body.nickname === 'a')

console.log('\n타이머')
const subject = (await A('POST', '/subjects', { name: '수학' })).body
const t0 = Date.now()
const started = (await A('POST', '/timer/start', { subjectId: subject.id })).body.timer
check('타이머 시작', started?.status === 'running')
check('타이머 동시에 두 개 → 409', (await A('POST', '/timer/start', { subjectId: subject.id })).status === 409)
check('다른 사람의 과목으로 시작 → 400', (await B('POST', '/timer/start', { subjectId: subject.id })).status === 400)
check('다른 기기(새 로그인)에서도 같은 타이머가 보임', (await A2('GET', '/timer')).body.timer?.id === started.id)

await A('POST', '/timer/pause')
await sleep(2100)
const pausedView = (await A('GET', '/timer')).body.timer
check('일시정지 중에는 시간이 흐르지 않음', pausedView.status === 'paused' && pausedView.elapsedSec <= 1, `elapsed=${pausedView.elapsedSec}`)
check('일시정지 중: 휴식 시간이 늘고 횟수 1회', pausedView.pausedSec >= 2 && pausedView.pauseCount === 1 && pausedView.totalSec >= pausedView.pausedSec, JSON.stringify(pausedView))
await A('POST', '/timer/resume')
backdate(started.id, 1800)
const [stop1, stop2] = await Promise.all([A('POST', '/timer/stop'), A('POST', '/timer/stop')])
const expected = 1800 + (Date.now() - t0) / 1000 - 2.1
const stopped = [stop1, stop2].find((r) => r.status === 200)
check('종료 동시 두 번 → 한 번만 성공', [stop1.status, stop2.status].sort().join() === '200,409', `${stop1.status},${stop2.status}`)
const dur = stopped?.body.record?.durationSec
check('공부시간 = 경과 − 일시정지 (정수 초, 오차 2초 이내)', Number.isInteger(dur) && Math.abs(dur - expected) <= 2, `duration=${dur}, expected≈${expected.toFixed(1)}`)
check('경험치 1분당 1 (29 또는 30)', [29, 30].includes(stopped?.body.xpGained), `xp=${stopped?.body.xpGained}`)
check('종료 응답에 총 경과·휴식·횟수 포함', stopped.body.record.pausedSec >= 2 && stopped.body.record.pauseCount === 1 && stopped.body.record.totalSec === dur + stopped.body.record.pausedSec, JSON.stringify(stopped.body.record))
await A('PATCH', `/records/${started.id}`, { memo: '미적분 3단원', reviewGood: '문제 풀이 속도 향상' })
await A('PATCH', `/records/${started.id}`, { reviewHard: '치환적분' })
const recordsA = (await A('GET', '/records')).body
check('기록 1건, 회고 4칸이 따로 저장되고 보낸 칸만 바뀜', recordsA.length === 1 && recordsA[0].memo === '미적분 3단원' && recordsA[0].reviewGood === '문제 풀이 속도 향상' && recordsA[0].reviewHard === '치환적분' && recordsA[0].reviewNote === '')

await B('POST', '/subjects', { name: '영어' })
const subB = (await B('GET', '/subjects')).body[0]
await B('POST', '/timer/start', { subjectId: subB.id })
const short = (await B('POST', '/timer/stop')).body
check('1분 미만 기록은 저장하지 않음', short.discarded === true && (await B('GET', '/records')).body.length === 0)

console.log('\n8시간 상한')
const subC = (await C('POST', '/subjects', { name: '전공' })).body
const long1 = (await C('POST', '/timer/start', { subjectId: subC.id })).body.timer
backdate(long1.id, 9 * 3600)
const capStop = (await C('POST', '/timer/stop')).body
check('9시간 켜 둔 뒤 종료 → 8시간만 기록', capStop.capped === true && capStop.record.durationSec === 8 * 3600, JSON.stringify(capStop.record))
check('경험치는 기록 1건 상한(240)까지', capStop.xpGained === 240)
const long2 = (await C('POST', '/timer/start', { subjectId: subC.id })).body.timer
backdate(long2.id, 10 * 3600)
const auto = (await C('GET', '/timer')).body
check('방치된 타이머는 조회 시 자동 종료되고 결과를 알려줌', auto.timer === null && auto.autoStopped?.capped === true && auto.autoStopped.record.durationSec === 8 * 3600)
check('자동 종료 후에는 진행 중 타이머 없음', (await C('GET', '/timer')).body.timer === null && (await C('GET', '/records')).body.length === 2)
// 뒤의 스터디 검증에 영향을 주지 않도록 C의 기록은 지운다
for (const r of (await C('GET', '/records')).body) await C('DELETE', `/records/${r.id}`)

console.log('\n주간 목표 · 경험치')
const goal = (await A('POST', '/goals', { title: '수학 3단원 끝내기' })).body
await A('POST', '/goals', { title: '영어 단어 200개' })
const xpBefore = (await A('GET', '/auth/me')).body.xp
await A('PATCH', `/goals/${goal.id}`, { done: true })
await A('PATCH', `/goals/${goal.id}`, { done: true })
check('목표 완료 +30 XP, 두 번 눌러도 한 번만', (await A('GET', '/auth/me')).body.xp === xpBefore + 30)
check('달성률 50%', (await A('GET', '/goals')).body.achievement === 50)
await A('PATCH', `/goals/${goal.id}`, { done: false })
check('체크 해제 시 경험치 회수', (await A('GET', '/auth/me')).body.xp === xpBefore)
await A('PATCH', `/goals/${goal.id}`, { done: true })

console.log('\n할 일 · 개인 일정 (본인만)')
const todo = (await A('POST', '/todos', { title: '도서관 책 반납' })).body
check('B는 A의 할 일을 수정할 수 없음', (await B('PATCH', `/todos/${todo.id}`, { done: true })).status === 404)
check('B의 할 일 목록에 A의 것이 없음', (await B('GET', '/todos')).body.length === 0)
await A('POST', '/todos', { title: '나중에 추가한 일' })
const long = (await A('POST', '/todos', { title: '가'.repeat(100) })).body
const todosA = (await A('GET', '/todos')).body
check('할 일: 최신순, 80자 제한', todosA[0].id === long.id && long.title.length === 80 && todosA.at(-1).id === todo.id)
const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)
const ev = (await A('POST', '/events', { title: '전공 퀴즈', date: `${month}-15`, startTime: '10:00' })).body
check('B는 A의 일정을 삭제할 수 없음', (await B('DELETE', `/events/${ev.id}`)).status === 404)
check('캘린더: A에게만 보임', (await A('GET', `/events?month=${month}`)).body.length === 1 && (await B('GET', `/events?month=${month}`)).body.length === 0)
await A('PUT', `/events/${ev.id}`, { title: '전공 퀴즈(변경)', date: `${month}-16` })
check('일정 수정 반영', (await A('GET', `/events?month=${month}`)).body[0].date === `${month}-16`)

console.log('\n스터디')
const study1 = (await A('POST', '/studies', { name: '스터디 1' })).body
const study2 = (await C('POST', '/studies', { name: '스터디 2' })).body
check('잘못된 초대 코드 → 404', (await B('POST', '/studies/join', { inviteCode: 'ZZZZZZZZ' })).status === 404)
await B('POST', '/studies/join', { inviteCode: study1.inviteCode })
await A('POST', '/studies/join', { inviteCode: study2.inviteCode })

const feedB = (await B('GET', `/studies/${study1.id}/feed`)).body
check('같은 스터디 B에게 A의 기록이 보임', feedB.length === 1 && feedB[0].nickname === 'a')
check('스터디 1 멤버가 아닌 C는 접근 불가 → 404', (await C('GET', `/studies/${study1.id}/feed`)).status === 404)
check('C는 스터디 2에서는 A의 기록을 봄 (여러 스터디에 자동 공유)', (await C('GET', `/studies/${study2.id}/feed`)).body.length === 1)
check('스터디 2곳에 공유돼도 A의 개인 누적은 한 번만', (await A('GET', '/records/stats')).body.totalSec === dur)
const home = (await B('GET', `/studies/${study1.id}`)).body
const memberA = home.members.find((m) => m.nickname === 'a')
check('멤버 현황: A의 이번 주 시간·달성률·레벨', memberA?.weekSec === dur && memberA?.achievement === 50 && memberA?.level >= 1)
check('B가 A의 이번 주 목표를 볼 수 있음', (await B('GET', `/studies/${study1.id}/members/${memberA.id}/goals`)).body.items.length === 2)
check('C는 스터디 1을 통해 A의 목표를 볼 수 없음', (await C('GET', `/studies/${study1.id}/members/${memberA.id}/goals`)).status === 404)

console.log('\n응원 · 댓글')
const rec = feedB[0].id
check('자기 기록은 응원할 수 없음 → 400', (await A('POST', `/studies/${study1.id}/feed/${rec}/cheer`)).status === 400)
const cheer1 = (await B('POST', `/studies/${study1.id}/feed/${rec}/cheer`)).body
check('B가 A의 기록을 응원 → 1', cheer1.cheered === true && cheer1.cheerCount === 1)
check('스터디 밖의 C는 스터디 1에서 응원할 수 없음 → 404', (await C('POST', `/studies/${study1.id}/feed/${rec}/cheer`)).status === 404)
await C('POST', `/studies/${study2.id}/feed/${rec}/cheer`)
const feedA1 = (await A('GET', `/studies/${study1.id}/feed`)).body[0]
check('응원 수는 스터디별로 따로 센다 (스터디 1에서는 1)', feedA1.cheerCount === 1 && feedA1.cheered === false)
const cheer2 = (await B('POST', `/studies/${study1.id}/feed/${rec}/cheer`)).body
check('다시 누르면 응원 취소 → 0', cheer2.cheered === false && cheer2.cheerCount === 0)

const comment = (await B('POST', `/studies/${study1.id}/feed/${rec}/comments`, { body: '고생했어요!' })).body
check('B가 댓글 작성', comment.id > 0 && comment.nickname === 'b')
check('빈 댓글 → 400', (await B('POST', `/studies/${study1.id}/feed/${rec}/comments`, { body: '  ' })).status === 400)
check('A에게 댓글이 보임', (await A('GET', `/studies/${study1.id}/feed/${rec}/comments`)).body.length === 1)
check('스터디 2에서는 스터디 1의 댓글이 보이지 않음', (await C('GET', `/studies/${study2.id}/feed/${rec}/comments`)).body.length === 0)
check('C는 스터디 1의 댓글을 읽을 수 없음 → 404', (await C('GET', `/studies/${study1.id}/feed/${rec}/comments`)).status === 404)
check('남의 댓글은 지울 수 없음 → 404', (await A('DELETE', `/studies/${study1.id}/comments/${comment.id}`)).status === 404)
check('피드의 댓글 수 1', (await A('GET', `/studies/${study1.id}/feed`)).body[0].commentCount === 1)
check('쓴 사람은 지울 수 있음', (await B('DELETE', `/studies/${study1.id}/comments/${comment.id}`)).status === 200)
await B('POST', `/studies/${study1.id}/feed/${rec}/comments`, { body: '삭제될 기록의 댓글' })

await B('POST', `/studies/${study1.id}/leave`)
check('탈퇴 후에는 스터디 접근 불가', (await B('GET', `/studies/${study1.id}`)).status === 404)

console.log('\n기록 삭제')
const xpWithRecord = (await A('GET', '/auth/me')).body.xp
await A('DELETE', `/records/${started.id}`)
check('기록 삭제 시 경험치도 함께 회수', (await A('GET', '/auth/me')).body.xp === xpWithRecord - stopped.body.xpGained)
check('개인 합계 0, 스터디 피드에서도 사라짐', (await A('GET', '/records/stats')).body.totalSec === 0 && (await C('GET', `/studies/${study2.id}/feed`)).body.length === 0)

console.log('\n로그아웃')
await A('POST', '/auth/logout')
check('로그아웃 후 API 호출 → 401', (await A('GET', '/auth/me')).status === 401)

console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과')
process.exit(failed ? 1 : 0)

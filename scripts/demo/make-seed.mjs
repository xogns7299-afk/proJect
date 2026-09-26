// 시연용 초기 데이터 SQL 만들기: npm run demo:sql → scripts/demo/seed.sql
// 이미 가입한 test1~test4 계정에 과거 공부 기록·목표·할 일·일정·스터디·응원·댓글을 넣는다.
// 계정(아이디·비밀번호·닉네임·캐릭터·복구 코드)은 건드리지 않는다. 실행하면 네 계정의 내용은 지우고 처음 상태로 다시 넣는다.
// 난수 씨앗을 고정해서 몇 번을 만들어도, 몇 번을 실행해도 같은 상태가 된다. 사용법은 docs/시연데이터.md
import { writeFileSync } from 'node:fs'

const LAST_DAY = '2026-09-26' // 기록은 이 날까지만 (그 뒤는 실제로 사용)
const INVITE = 'SCNUSTDY'

let seed = 20260927
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (a, b) => a + Math.floor(rand() * (b - a + 1))

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const kst = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+09:00`)
const addDays = (date, n) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekStart = (date) => {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}
const uid = (login) => `(SELECT id FROM users WHERE login_id = ${q(login)})`
const sid = (login, name) => `(SELECT id FROM subjects WHERE user_id = ${uid(login)} AND name = ${q(name)} AND archived = 0)`

// 계정별 설정. goalXp·목표 개수는 레벨이 원하는 곳에 오도록 맞춘 값이다.
const USERS = [
  {
    login: 'test1',
    from: '2026-09-14',
    minutes: [25, 75],
    perDay: [1, 2],
    // 발표 시연용: Lv4 끝(998 XP). 타이머 2분이면 Lv5 → 성장 모습 공개 장면
    targetXp: 998,
    subjects: [
      ['자료구조', '#4f6ef7', ['연결 리스트 구현 복습', '스택·큐 문제 5개 풀이', '트리 순회 정리', '과제 3 코드 정리', '힙 정렬 손으로 따라가기']],
      ['토익', '#f59e0b', ['LC 파트2 30문항', 'RC 파트5 문법 정리', '모의고사 1회 오답 정리', '단어 Day 12~13']],
      ['웹프로그래밍', '#10b981', ['fetch·async 정리', '해커톤 화면 반응형 작업', 'CSS 그리드 연습', 'Hono 라우트 공부']],
    ],
    goals: {
      '2026-09-14': [['자료구조 과제 2 제출', 1], ['토익 LC 매일 30분', 1], ['운동 3번', 0], ['웹 강의 3강', 1]],
      '2026-09-21': [['해커톤 배포 끝내기', 1], ['자료구조 과제 3 제출', 1], ['토익 모의고사 1회', 1], ['매일 1시간 공부', 0], ['README 정리', 0]],
      '2026-09-28': [['해커톤 발표 잘하기', 0], ['토익 모의고사 2회', 0], ['자료구조 중간고사 범위 1회독', 0]],
    },
    todos: [['발표 자료 최종 확인', 0], ['시연 순서 연습', 0], ['README 스크린샷 넣기', 1], ['자료구조 과제 3 제출', 1], ['도서관 책 반납', 0]],
    events: [
      ['팀 회의', '2026-09-24', '20:00', '21:00', '배포 점검'],
      ['해커톤 최종 제출', '2026-09-27', '22:00', null, '갤러리 등록·발표자료'],
      ['해커톤 발표·시상식', '2026-09-30', '13:00', '17:00', '갤러리 링크로 시연'],
      ['토익 시험', '2026-10-11', '09:20', '11:30', ''],
      ['자료구조 중간고사', '2026-10-20', '10:30', '12:00', '범위: 1~6장'],
    ],
  },
  {
    login: 'test2',
    from: '2026-09-01',
    minutes: [45, 150],
    perDay: [1, 3],
    targetXp: 4760, // Lv10 (어른 모습)
    subjects: [
      ['정보처리기사', '#ef4444', ['필기 1과목 기출 2회', '데이터베이스 정규화 정리', '소프트웨어 설계 요약노트', '기출 오답 30문항', '네트워크 파트 암기']],
      ['선형대수', '#8b5cf6', ['행렬식 성질 증명', '고유값 연습문제 12개', '과제 풀이', '대각화 정리']],
      ['영어', '#0ea5e9', ['쉐도잉 20분 + 단어', '영어 뉴스 한 편 요약', '회화 표현 정리']],
      ['알고리즘', '#10b981', ['백준 DP 3문제', '그래프 탐색 BFS/DFS', '이분 탐색 문제 풀이', '프로그래머스 레벨2 2문제']],
    ],
    goals: {
      '2026-08-31': [['정처기 기출 3회', 1], ['선형대수 과제', 1], ['백준 10문제', 1], ['영어 매일 20분', 0]],
      '2026-09-07': [['정처기 기출 3회', 1], ['선형대수 과제', 1], ['백준 10문제', 1], ['영어 매일 20분', 1], ['6시간 공부 하루', 0]],
      '2026-09-14': [['정처기 요약노트 완성', 1], ['선형대수 과제', 1], ['백준 10문제', 0], ['영어 매일 20분', 1]],
      '2026-09-21': [['정처기 기출 5회', 1], ['선형대수 퀴즈 준비', 1], ['백준 10문제', 1], ['영어 매일 20분', 1], ['주말 모의고사', 0]],
      '2026-09-28': [['정처기 필기 마무리', 0], ['백준 골드 1문제', 0]],
    },
    todos: [['정처기 접수 확인', 1], ['선형대수 과제 4', 0], ['노트북 충전기 챙기기', 0], ['오답노트 복사', 1]],
    events: [
      ['스터디 모의고사', '2026-09-29', '19:00', '21:00', ''],
      ['정보처리기사 필기', '2026-10-11', '09:00', '11:30', '수험표·신분증'],
      ['선형대수 중간고사', '2026-10-21', '13:00', '14:30', ''],
    ],
  },
  {
    login: 'test3',
    from: '2026-09-07',
    minutes: [30, 100],
    perDay: [1, 2],
    targetXp: 1790, // Lv6 (성장 모습)
    subjects: [
      ['회로이론', '#f97316', ['키르히호프 법칙 예제', '테브난 등가회로 문제', 'RC 회로 과도응답 정리', '과제 2 풀이']],
      ['한국사', '#a855f7', ['근현대사 강의 2강', '기출 50문항', '연표 정리', '오답 복습']],
      ['코딩테스트', '#14b8a6', ['문자열 문제 3개', '구현 문제 2개', '정렬 문제 복습', '해시 문제 풀이']],
    ],
    goals: {
      '2026-09-07': [['한국사 1~10강', 1], ['회로이론 과제 1', 1], ['코테 5문제', 0]],
      '2026-09-14': [['한국사 11~20강', 1], ['회로이론 과제 2', 1], ['코테 5문제', 1], ['아침 공부 3번', 0]],
      '2026-09-21': [['한국사 기출 3회', 1], ['회로이론 퀴즈 준비', 1], ['코테 5문제', 0]],
      '2026-09-28': [['한국사 시험 마무리', 0], ['회로이론 중간 범위 정리', 0]],
    },
    todos: [['한국사 시험 수험표 출력', 0], ['회로 실험 보고서', 1], ['계산기 배터리 교체', 0]],
    events: [
      ['한국사능력검정시험', '2026-10-17', '10:00', '11:20', '수험표 출력'],
      ['회로이론 중간고사', '2026-10-22', '09:00', '10:30', ''],
    ],
  },
  {
    login: 'test4',
    from: '2026-09-22',
    minutes: [20, 50],
    perDay: [1, 1],
    targetXp: 190, // Lv2, 막 시작한 사람
    subjects: [
      ['파이썬 기초', '#3b82f6', ['변수와 자료형', '조건문·반복문 연습', '리스트·딕셔너리', '함수 만들기']],
      ['영단어', '#eab308', ['단어 50개', '단어 복습 테스트']],
    ],
    goals: {
      '2026-09-21': [['파이썬 1~4장', 1], ['매일 30분 공부', 0], ['단어 300개', 0]],
      '2026-09-28': [['파이썬 5~6장', 0], ['매일 30분 공부', 0]],
    },
    todos: [['파이썬 교재 사기', 1], ['스터디 초대 코드 입력', 1], ['공부 시간 정하기', 0]],
    events: [['파이썬 과제 제출', '2026-09-30', '23:59', null, '']],
  },
]

const REVIEWS = {
  good: ['집중이 잘 됐다', '계획한 분량을 끝냈다', '어려운 부분을 이해했다', '핸드폰 안 보고 끝까지 했다', ''],
  hard: ['중간에 졸렸다', '개념이 헷갈렸다', '시간이 부족했다', '문제 풀이가 느리다', ''],
  note: ['내일은 오답부터 보기', '다음엔 30분 일찍 시작', '헷갈린 부분 다시 정리하기', '', ''],
}
const START_TIMES = { weekday: ['10:10', '13:30', '15:20', '19:40', '20:30', '21:15'], weekend: ['09:30', '11:00', '14:00', '16:30', '20:00'] }

const out = []
const line = (s) => out.push(s)
const users = USERS.map((u) => u.login)
const inUsers = `(SELECT id FROM users WHERE login_id IN (${users.map(q).join(', ')}))`

line('-- 시연용 초기 데이터 (npm run demo:sql 로 만듦 — 직접 고치지 말고 scripts/demo/make-seed.mjs 를 고친다). 사용법: docs/시연데이터.md')
line('-- test1~test4 계정이 먼저 가입돼 있어야 한다.')
line('-- 네 계정의 기존 내용(기록·과목·할 일·일정·목표·경험치·스터디)을 지우고 새로 넣는다. 계정 자체는 그대로 둔다.')
line('')
line('-- 0) 안전장치: test1~test4 네 계정이 모두 있어야 진행한다. 하나라도 없으면 이 줄에서 오류(malformed JSON)로 멈추고 아무것도 바꾸지 않는다.')
line(`SELECT CASE WHEN (SELECT COUNT(*) FROM users WHERE login_id IN (${users.map(q).join(', ')})) = ${users.length} THEN 'ok' ELSE json('test1~test4 계정이 모두 있어야 합니다') END AS check_accounts;`)
line('')
line('-- 1) 네 계정의 기존 내용 지우기')
const ownedStudies = `(SELECT id FROM studies WHERE owner_id IN ${inUsers} OR invite_code = ${q(INVITE)})`
const demoSessions = `(SELECT id FROM study_sessions WHERE user_id IN ${inUsers})`
line(`DELETE FROM record_comments WHERE user_id IN ${inUsers} OR session_id IN ${demoSessions} OR study_id IN ${ownedStudies};`)
line(`DELETE FROM record_cheers WHERE user_id IN ${inUsers} OR session_id IN ${demoSessions} OR study_id IN ${ownedStudies};`)
line(`DELETE FROM study_members WHERE user_id IN ${inUsers} OR study_id IN ${ownedStudies};`)
line(`DELETE FROM studies WHERE id IN ${ownedStudies};`)
line(`DELETE FROM xp_events WHERE user_id IN ${inUsers};`)
line(`DELETE FROM study_sessions WHERE user_id IN ${inUsers};`)
line(`DELETE FROM subjects WHERE user_id IN ${inUsers};`)
line(`DELETE FROM todos WHERE user_id IN ${inUsers};`)
line(`DELETE FROM events WHERE user_id IN ${inUsers};`)
line(`DELETE FROM weekly_goal_items WHERE user_id IN ${inUsers};`)
line(`UPDATE users SET display_stage = NULL WHERE id IN ${inUsers};`)

const sessionsByUser = {}

for (const u of USERS) {
  line('')
  line(`-- 2) ${u.login}`)
  const created = kst(addDays(u.from, -1), '21:00')
  for (const [name, color] of u.subjects) {
    line(`INSERT INTO subjects (user_id, name, color, created_at) VALUES (${uid(u.login)}, ${q(name)}, ${q(color)}, ${created});`)
  }

  // 목표 경험치 (지난 주·이번 주에 이미 체크한 것)
  let goalXp = 0
  for (const [week, items] of Object.entries(u.goals)) {
    for (const [title, done] of items) {
      const doneAt = done ? kst(addDays(week, between(1, 5)), '22:00') : null
      if (done) goalXp += 30
      line(
        `INSERT INTO weekly_goal_items (user_id, week_start, title, done, done_at) VALUES (${uid(u.login)}, ${q(week)}, ${q(title)}, ${done}, ${q(doneAt)});`
      )
    }
  }

  // 공부 기록: from ~ LAST_DAY, 가끔 쉬는 날
  const sessions = []
  for (let day = u.from; day <= LAST_DAY; day = addDays(day, 1)) {
    const dow = new Date(day + 'T00:00:00Z').getUTCDay()
    if (day !== LAST_DAY && rand() < 0.12) continue
    const weekend = dow === 0 || dow === 6
    const starts = [...(weekend ? START_TIMES.weekend : START_TIMES.weekday)]
    const count = between(u.perDay[0], u.perDay[1])
    const chosen = []
    for (let i = 0; i < count && starts.length; i++) chosen.push(starts.splice(Math.floor(rand() * starts.length), 1)[0])
    chosen.sort()
    for (const t of chosen) {
      const [name, , memos] = pick(u.subjects)
      sessions.push({ day, start: t, subject: name, memo: pick(memos), minutes: between(u.minutes[0], u.minutes[1]) })
    }
  }

  // 목표 레벨에 맞게 공부시간을 고르게 늘리거나 줄인다 (기록 1건 4시간 상한 안에서)
  const want = u.targetXp - goalXp
  const have = sessions.reduce((s, x) => s + x.minutes, 0)
  const scale = want / have
  for (const s of sessions) s.minutes = Math.max(15, Math.min(230, Math.round(s.minutes * scale)))
  let diff = want - sessions.reduce((s, x) => s + x.minutes, 0)
  for (let i = 0; diff !== 0; i = (i + 1) % sessions.length) {
    const s = sessions[i]
    const step = diff > 0 ? 1 : -1
    if (s.minutes + step >= 15 && s.minutes + step <= 230) {
      s.minutes += step
      diff -= step
    }
  }

  for (const s of sessions) {
    const pauseCount = rand() < 0.4 ? between(1, 2) : 0
    const pausedSec = pauseCount ? pauseCount * between(3, 12) * 60 : 0
    const durationSec = s.minutes * 60 + between(0, 50) // 분 단위 버림이라 XP는 minutes 그대로
    const startedAt = kst(s.day, s.start)
    const endedAt = startedAt + (durationSec + pausedSec) * 1000
    const withReview = rand() < 0.5
    const r = withReview ? [pick(REVIEWS.good), pick(REVIEWS.hard), pick(REVIEWS.note)] : ['', '', '']
    s.startedAt = startedAt
    line(
      `INSERT INTO study_sessions (user_id, subject_id, status, started_at, start_date, paused_total_sec, pause_count, ended_at, duration_sec, memo, review_good, review_hard, review_note) VALUES (${uid(
        u.login
      )}, ${sid(u.login, s.subject)}, 'done', ${startedAt}, ${q(s.day)}, ${pausedSec}, ${pauseCount}, ${endedAt}, ${durationSec}, ${q(s.memo)}, ${q(r[0])}, ${q(r[1])}, ${q(r[2])});`
    )
  }
  sessionsByUser[u.login] = sessions

  u.todos.forEach(([title, done], i) => {
    const at = kst(addDays(LAST_DAY, -(u.todos.length - i)), '12:00')
    line(`INSERT INTO todos (user_id, title, done, done_at, created_at) VALUES (${uid(u.login)}, ${q(title)}, ${done}, ${done ? at + 3600000 : 'NULL'}, ${at});`)
  })
  for (const [title, date, st, et, memo] of u.events) {
    line(`INSERT INTO events (user_id, title, date, start_time, end_time, memo) VALUES (${uid(u.login)}, ${q(title)}, ${q(date)}, ${q(st)}, ${q(et)}, ${q(memo)});`)
  }
}

// 3) 경험치: 서버와 같은 규칙 (기록 = 분당 1XP·1건 240 상한, 완료한 목표 = 30XP)
line('')
line('-- 3) 경험치 (서버와 같은 규칙: 기록 1분당 1XP·1건 240 상한, 완료한 목표 30XP)')
line(
  `INSERT INTO xp_events (user_id, type, ref_id, amount, created_at) SELECT user_id, 'study_session', id, MIN(240, duration_sec / 60), ended_at FROM study_sessions WHERE user_id IN ${inUsers} AND status = 'done';`
)
line(
  `INSERT INTO xp_events (user_id, type, ref_id, amount, created_at) SELECT user_id, 'weekly_goal', id, 30, done_at FROM weekly_goal_items WHERE user_id IN ${inUsers} AND done = 1;`
)

// 4) 스터디: test1이 만들고 나머지가 가입
line('')
line('-- 4) 스터디')
const studyId = `(SELECT id FROM studies WHERE invite_code = ${q(INVITE)})`
line(
  `INSERT INTO studies (name, description, owner_id, invite_code, created_at) VALUES ('SCNU 공부방', '서로의 공부 기록 보면서 자극받기! 하루 1시간 이상 기록하기', ${uid('test1')}, ${q(INVITE)}, ${kst('2026-09-14', '21:00')});`
)
const joined = { test1: '2026-09-14', test2: '2026-09-14', test3: '2026-09-15', test4: '2026-09-22' }
for (const [login, date] of Object.entries(joined)) {
  line(
    `INSERT INTO study_members (study_id, user_id, role, joined_at) VALUES (${studyId}, ${uid(login)}, ${q(login === 'test1' ? 'owner' : 'member')}, ${kst(date, '21:30')});`
  )
}

// 5) 응원·댓글: 최근 5일 기록에 다른 멤버들이 가끔 응원
line('')
line('-- 5) 응원·댓글')
const session = (login, s) => `(SELECT id FROM study_sessions WHERE user_id = ${uid(login)} AND started_at = ${s.startedAt})`
const recentFrom = addDays(LAST_DAY, -5)
for (const [login, sessions] of Object.entries(sessionsByUser)) {
  for (const s of sessions.filter((x) => x.day >= recentFrom && x.day >= joined[login])) {
    for (const other of users) {
      if (other === login || s.day < joined[other] || rand() > 0.45) continue
      line(
        `INSERT INTO record_cheers (study_id, session_id, user_id, created_at) VALUES (${studyId}, ${session(login, s)}, ${uid(other)}, ${s.startedAt + 4 * 3600000});`
      )
    }
  }
}
const COMMENTS = [
  ['test2', 'test1', '배포까지 하다니 대단해요 👍'],
  ['test3', 'test2', '오늘도 열공이네요… 자극받고 갑니다'],
  ['test1', 'test4', '첫 주부터 매일 기록 좋아요!'],
  ['test4', 'test2', '어떻게 그렇게 오래 집중하세요?'],
  ['test2', 'test4', '처음엔 30분씩만 해도 충분해요 화이팅'],
  ['test1', 'test3', '한국사 시험 같이 파이팅!'],
]
COMMENTS.forEach(([writer, owner, body], i) => {
  const list = sessionsByUser[owner].filter((x) => x.day >= recentFrom)
  const s = list[list.length - 1 - (i % Math.max(1, Math.min(2, list.length)))] || list[list.length - 1]
  line(
    `INSERT INTO record_comments (study_id, session_id, user_id, body, created_at) VALUES (${studyId}, ${session(owner, s)}, ${uid(writer)}, ${q(body)}, ${s.startedAt + (5 + i) * 3600000});`
  )
})

line('')
line('-- 6) 확인: 계정별 경험치 합계 (test1 998, test2 4760, test3 1790, test4 190 이 나와야 한다)')
line(
  `SELECT u.login_id, (SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE user_id = u.id) AS xp, (SELECT COUNT(*) FROM study_sessions WHERE user_id = u.id) AS records FROM users u WHERE u.id IN ${inUsers} ORDER BY u.login_id;`
)

writeFileSync(new URL('./seed.sql', import.meta.url), out.join('\n') + '\n')
console.log('scripts/demo/seed.sql 을 만들었습니다')

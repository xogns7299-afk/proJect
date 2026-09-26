# 서버 API

- 최종 수정: 2026-09-21
- 모든 주소는 `/api`로 시작한다. 요청·응답은 JSON.
- `/api/auth/signup`, `/login`, `/logout`, `/api/health`를 뺀 모든 API는 로그인이 필요하다 (없으면 401).
- 실패하면 `{ "error": "한국어 메시지" }`를 돌려준다. 화면은 이 메시지를 그대로 보여주면 된다.
- 시각은 UTC 밀리초 숫자, 날짜는 한국시간 `YYYY-MM-DD`, 시간은 `HH:MM`.
- 다른 사람의 자료를 요청하면 "없음(404)"으로 응답한다. 권한은 전부 서버에서 검사한다.
- 브라우저에서는 `public/static/js/api.js`의 `api.get/post/put/patch/del`을 쓴다.

## 계정 `/api/auth`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| POST | `/signup` | `loginId`(영문 소문자·숫자·_ 4~20자), `password`(8자 이상), `nickname`(12자 이내), `characterId` | 가입 후 바로 로그인 상태가 된다 |
| POST | `/login` | `loginId`, `password` | |
| POST | `/logout` | | |
| GET | `/me` | | `id, loginId, nickname, characterId, xp, level, current, needed` (current/needed = 현재 레벨에서 모은 XP / 다음 레벨까지 필요한 XP) |
| PATCH | `/me` | `nickname?`, `characterId?` | |

## 과목 `/api/subjects`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | | 내 과목 목록 `id, name, color` |
| POST | `/` | `name`, `color?`(#RRGGBB) | |
| PATCH | `/:id` | `name`, `color?` | |
| DELETE | `/:id` | | 목록에서만 숨긴다 (과거 기록 유지) |

## 타이머 `/api/timer`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | | `{ timer, now }`. 진행 중인 타이머가 없으면 `timer: null` |
| POST | `/start` | `subjectId` | 이미 진행 중이면 409 |
| POST | `/pause` | | |
| POST | `/resume` | | |
| POST | `/stop` | | 공부시간 확정. `{ record, capped, xpGained, leveledUp, xp, level, current, needed }`. 1분 미만이면 저장하지 않고 `{ discarded: true, durationSec, minSec }` |

- `timer` = `id, subjectId, subject, status(running/paused), startedAt, elapsedSec(공부시간), totalSec(총 경과), pausedSec(휴식), pauseCount, maxSec(상한 28800)`
- 화면의 타이머 숫자는 받은 값에서 시작해 1초씩 올리면 된다(일시정지 중에는 공부시간 대신 휴식을 올린다). 새로고침하면 `GET /`으로 다시 받아 이어간다.
- **8시간 상한:** 공부시간이 `maxSec`에 닿은 채 `GET /`을 부르면 서버가 그 자리에서 종료하고 `{ timer: null, autoStopped: {종료 응답과 같은 모양} }`을 **한 번만** 돌려준다. `POST /stop`도 8시간을 넘겼으면 8시간으로 잘라 기록하고 `capped: true`를 준다.
- 종료 응답의 `record` = `id, subject, startedAt, endedAt, durationSec, totalSec, pausedSec, pauseCount`.
- 종료 후 회고는 `PATCH /api/records/:id`로 저장한다.
- 사진: `POST /api/records/:id/photo` (multipart `kind`=start|end, `file` JPG/PNG/WEBP 3MB 이하, 내 기록만) → `{ key, url }`. `GET /api/photos/<key>`는 기록 주인과 같은 스터디 멤버만 볼 수 있다. 저장소는 R2 바인딩 `PHOTOS`. 브라우저는 `uploadPhoto()`(api.js)가 긴 변 1280px JPEG로 줄여 올린다.

## 공부 기록 `/api/records`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | 쿼리 `subjectId?`, `from?`, `to?` | 최근 200건. `id, subjectId, subject, color, startedAt, endedAt, date, durationSec, pausedSec, pauseCount, memo, reviewGood, reviewHard, reviewNote, startPhoto, endPhoto` |
| GET | `/stats` | | `todaySec, weekSec, totalSec, recordCount, bySubject[{subjectId, subject, color, totalSec}]` |
| PATCH | `/:id` | `memo?`(공부한 내용), `reviewGood?`, `reviewHard?`, `reviewNote?` | 보낸 칸만 바뀐다. `memo`만 스터디 피드에 보인다 |
| DELETE | `/:id` | | 그 기록으로 받은 경험치도 함께 회수 |

## 할 일 `/api/todos`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | | 최신순. 진행중/완료 필터는 화면에서 거른다 |
| POST | `/` | `title`(80자) | |
| PATCH | `/:id` | `title?`, `done?` | |
| DELETE | `/done` | | 완료 항목 한 번에 지우기 |
| DELETE | `/:id` | | |

## 일정 `/api/events`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | 쿼리 `month=YYYY-MM` | 그 달의 내 일정 목록 `id, title, date, startTime, endTime, memo` |
| POST | `/` | `title`, `date`, `startTime?`, `endTime?`, `memo?` | 개인 일정 |
| PUT | `/:id` | 위와 같음 | |
| DELETE | `/:id` | | |

## 주간 목표 `/api/goals`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | 쿼리 `week?`(그 주의 아무 날짜) | `{ weekStart, items[{id,title,done}], achievement(%) }`. 생략하면 이번 주 |
| POST | `/` | `title`, `week?` | |
| PATCH | `/:id` | `title?`, `done?` | 완료하면 +30 XP, 해제하면 회수. 바뀐 `xp, level…`을 함께 돌려준다 |
| DELETE | `/:id` | | |

## 스터디 `/api/studies`

| 방식 | 주소 | 보내는 값 | 설명 |
|---|---|---|---|
| GET | `/` | | 내가 가입한 스터디 `id, name, description, role, memberCount` |
| POST | `/` | `name`, `description?` | 만든 사람이 스터디장. `inviteCode`를 돌려준다 |
| POST | `/join` | `inviteCode` | |
| GET | `/:id` | | 스터디 홈: `name, description, inviteCode, role, myId, members[]` |
| GET | `/:id/feed` | | 멤버들의 공부 기록 최근 50건. 기록마다 `cheerCount, cheered(내가 눌렀는지), commentCount` 포함 |
| POST | `/:id/feed/:recordId/cheer` | | 응원 켜기/끄기. `{ cheered, cheerCount }`. 자기 기록이면 400 |
| GET | `/:id/feed/:recordId/comments` | | 댓글 목록 `id, userId, nickname, characterId, body, createdAt` |
| POST | `/:id/feed/:recordId/comments` | `body`(300자) | |
| DELETE | `/:id/comments/:commentId` | | 쓴 사람만 |
| GET | `/:id/members/:userId/goals` | 쿼리 `week?` | 그 멤버의 주간 목표 |
| POST | `/:id/leave` | | 탈퇴 (스터디장은 불가) |
| DELETE | `/:id` | | 스터디 삭제 (스터디장만) |

- `members[]` = `id, nickname, characterId, role, xp, level, weekSec, goalTotal, goalDone, achievement(%), studying(지금 공부 중), studyingSubject(공부 중인 과목)`. 이번 주 공부시간이 많은 순.
- 응원·댓글은 스터디 단위로 저장된다. 같은 기록이라도 다른 스터디에서는 그 스터디의 반응만 보인다.
- 피드·멤버 현황은 복사본이 아니라 각자의 원본 기록을 조회한다 → 여러 스터디에 가입해도 개인 누적은 중복되지 않는다.

## 조정 가능한 수치

`src/lib/rules.ts` 한 곳에 있다: 1분당 XP, 기록 1건당 XP 상한, 목표 항목 XP, 저장 최소 시간(1분), 기록 1건의 최대 시간(8시간), 레벨 곡선.

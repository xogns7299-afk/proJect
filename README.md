# proJect — 공부 관리 웹앱

> 2026 SCNU OSS·AI 해커톤 (기초트랙) 출품작

혼자 하는 공부를 타이머로 기록하고, 캐릭터를 키우고, 스터디 멤버들의 공부하는 모습을 보며 자극받는 심플한 공부 관리 웹앱입니다.

## 주요 기능

- **공부기록 타이머** — 과목을 골라 시작 → 일시정지/종료 → 공부 내용 작성 → 자동 기록. 과목별 공부시간 조회
- **To-do 리스트** — 단순 체크리스트
- **일정관리** — 개인 캘린더
- **주간 목표** — 이번 주 목표와 달성률, 스터디에 자동 공유
- **스터디** — 멤버끼리 서로의 공부 기록·목표 달성 현황을 보고 응원(👏)·댓글 남기기
- **레벨업 시스템** — 캐릭터를 고르고, 공부하면 경험치를 얻어 레벨업

> 현재 상태: 서버 API와 DB, 로그인·가입, 홈, 공부 타이머, 기록, 할 일, 캘린더, 스터디 화면, 오공시·오공완 사진 업로드, 캐릭터·로고, 다크/라이트 모드가 팀장 PC(로컬)에서 동작합니다. Genspark 배포는 아직입니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | HTML, CSS, JavaScript |
| 백엔드 | [Hono](https://hono.dev) (TypeScript) |
| 배포 | Cloudflare Pages (Genspark 호스팅) |
| 데이터 저장 | Cloudflare D1 (사진은 R2) |
| 개발 도구 | Claude Code, Genspark CODE |

## 실행 방법

Node.js 20 이상이 필요합니다.

```bash
npm install               # 최초 1회
npm run db:migrate:local  # 로컬 DB 만들기 (최초 1회)
npm run dev               # 개발 서버 실행 → http://localhost:5173
npm run build             # 배포용 빌드 → dist/
```

## 폴더 구조

```
├── src/                 # 서버 (Hono): index.tsx, routes/, lib/
├── migrations/          # DB 스키마 (Cloudflare D1)
├── public/static/       # 브라우저용 JS, CSS
├── scripts/             # 검증 스크립트
├── docs/                # 기획·설계 문서
├── mockup/              # 화면 목업
└── assets/              # 이미지 등
```

## 문서

- [팀 공유 — 프로젝트 진행 정리](docs/팀공유_프로젝트_진행정리.md)
- [기획서](docs/기획서.md) · [기능명세](docs/기능명세.md) · [데이터 모델](docs/데이터모델.md)
- [기술 스택 결정](docs/기술스택.md) · [서버 API](docs/API.md) · [대회 정보](docs/대회정보.md)

## 라이선스

[MIT](LICENSE)

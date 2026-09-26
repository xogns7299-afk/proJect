-- 시각은 모두 UTC 밀리초(INTEGER). 날짜(TEXT, YYYY-MM-DD)는 한국시간 기준.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  character_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f6ef7',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_subjects_user ON subjects(user_id);

CREATE TABLE study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'done')),
  started_at INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  paused_at INTEGER,
  paused_total_sec INTEGER NOT NULL DEFAULT 0,
  pause_count INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  duration_sec INTEGER,
  -- 회고 4칸. memo = 공부한 내용(스터디 피드에 보이는 칸), 나머지는 본인만 본다
  memo TEXT NOT NULL DEFAULT '',
  review_good TEXT NOT NULL DEFAULT '',
  review_hard TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  start_photo TEXT,
  end_photo TEXT
);
-- 진행 중(running/paused)인 타이머는 사용자당 1개만
CREATE UNIQUE INDEX idx_study_sessions_one_active ON study_sessions(user_id) WHERE status <> 'done';
CREATE INDEX idx_study_sessions_user_date ON study_sessions(user_id, start_date);

CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_todos_user ON todos(user_id);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  memo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_events_user_date ON events(user_id, date);

CREATE TABLE weekly_goal_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER
);
CREATE INDEX idx_goals_user_week ON weekly_goal_items(user_id, week_start);

CREATE TABLE studies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE study_members (
  study_id INTEGER NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (study_id, user_id)
);
CREATE INDEX idx_study_members_user ON study_members(user_id);

-- 응원·댓글은 스터디 단위로 남긴다. 기록은 주인이 가입한 모든 스터디에 보이지만,
-- 서로 모르는 다른 스터디 사람들의 반응이 섞여 보이지 않게 하기 위해서다.
CREATE TABLE record_cheers (
  study_id INTEGER NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (study_id, session_id, user_id)
);

CREATE TABLE record_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id INTEGER NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_record_comments_target ON record_comments(study_id, session_id);

CREATE TABLE xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('study_session', 'weekly_goal')),
  ref_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (type, ref_id)
);
CREATE INDEX idx_xp_user ON xp_events(user_id);

-- 비밀번호 찾기용 복구 코드. 코드는 가입·재발급 때 한 번만 보여 주고 DB에는 해시만 저장한다.
-- 복구 코드를 5번 틀리면 15분 동안 잠근다 (코드를 마구 넣어 보는 것을 막는다).
ALTER TABLE users ADD COLUMN recovery_hash TEXT;
ALTER TABLE users ADD COLUMN recovery_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN recovery_locked_until INTEGER;

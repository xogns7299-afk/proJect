-- 레벨이 올라도 이전 모습(예: 아기 모습)을 계속 보여 주고 싶을 때 고르는 표시 단계.
-- NULL = 자동(열린 것 중 가장 최근 모습), 1~3 = 그 단계. 열린 단계(레벨)를 넘으면 열린 가장 높은 단계로 보인다.
ALTER TABLE users ADD COLUMN display_stage INTEGER;

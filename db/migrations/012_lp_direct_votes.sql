-- =============================================================================
-- 012_lp_direct_votes.sql — LP가 LP 시스템에서 직접 투표 (D40)
-- =============================================================================
-- 지금까지는 GP가 조합원별 찬반을 대신 입력했다 (서면 결의서를 받아 옮겨 적는 방식).
-- 이제 LP 시스템이 LP 연동 API로 본인 찬반을 직접 제출할 수 있다.
--
--   · channel: 'gp' = GP가 입력 / 'lp_system' = LP가 LP 시스템에서 직접 제출
--   · LP가 직접 한 투표는 GP가 바꿀 수 없다. LP는 개최 처리 전까지 자기 투표를 다시 제출할 수 있다
--   · LP 직접 투표는 GP 사용자가 기록한 게 아니라 created_by 가 비어 있다
-- =============================================================================

alter table votes add column channel text not null default 'gp' check (channel in ('gp', 'lp_system'));
alter table votes add constraint lp_vote_has_no_user check (channel = 'gp' or created_by is null);
comment on column votes.channel is '투표 경로: gp(GP 입력) / lp_system(LP 직접)';

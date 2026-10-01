-- =============================================================================
-- 016_lp_erp_integration.sql — LP 기관용 ERP 연동 보완 (D45, D46)
-- =============================================================================
-- ① 출자 제안을 누가 바꿨는지 (D45): GP 화면에서 바꿨으면 gp, LP 시스템이 응답 API로 바꿨으면 lp_system.
--    GP 화면의 "LP 직접" 표시에 쓴다 (D40 투표 channel 과 같은 방식). 아직 아무도 응답하지 않은 제안은 비어 있다
-- ② 이벤트 바로 보내기 (D46): 이벤트를 만든 요청이 끝나면 자동으로 전송한다. 주기 작업 실행 기록에 auto 를 더한다
-- =============================================================================

alter table lp_proposals add column decided_via text check (decided_via in ('gp', 'lp_system'));
comment on column lp_proposals.decided_via is '마지막으로 제안 상태를 바꾼 곳: gp(GP 화면) / lp_system(LP 시스템 응답 API, D45)';

-- 이미 결정된 제안은 모두 GP 화면에서 결정한 것이다
update lp_proposals set decided_via = 'gp' where status <> 'proposed';

alter table scheduled_jobs drop constraint scheduled_jobs_last_trigger_check;
alter table scheduled_jobs add constraint scheduled_jobs_last_trigger_check check (last_trigger in ('cron', 'manual', 'auto'));

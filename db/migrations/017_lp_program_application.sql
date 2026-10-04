-- =============================================================================
-- 017_lp_program_application.sql — LP ERP 출자사업 공고에 지원 (D47, LP L50~L55)
-- =============================================================================
-- GP의 공고 지원은 그 기관 앞 출자 제안 하나로 남긴다 (L53). 어느 공고 · 부문에 지원했는지와 LP에 보낸 결과를 더한다
-- · lp_program_id / lp_track_id: LP ERP의 출자사업 · 모집 부문 ID (LP가 원본. GP는 지원 당시 이름을 함께 남긴다)
-- · applied_at: GP에서 지원한 시각. 접수 기간은 LP가 받은 시각으로 본다 (L54) — apply_sent_at 이 그 시각
-- · apply_error_code / apply_error: LP에 닿지 못했거나 LP가 거부한 이유 (마감 등). 다시 보내기로 지운다
-- =============================================================================

alter table lp_proposals
  add column lp_program_id    uuid,
  add column lp_track_id      uuid,
  add column program_name     text,
  add column track_name       text,
  add column applied_at       timestamptz,
  add column apply_sent_at    timestamptz,
  add column apply_error_code text,
  add column apply_error      text,
  add constraint application_complete check (
    (lp_program_id is null and lp_track_id is null and applied_at is null)
    or (lp_program_id is not null and lp_track_id is not null and program_name is not null and track_name is not null and applied_at is not null)
  );

comment on column lp_proposals.lp_program_id is 'LP ERP 출자사업 공고 ID — 공고 지원으로 만든 제안이면 있다 (D47)';
comment on column lp_proposals.apply_sent_at is 'LP ERP가 지원을 받은 시각 (접수 기간 기준, L54). 비어 있으면 아직 못 보냄';

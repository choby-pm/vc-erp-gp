-- =============================================================================
-- 019_lp_selection_terms.sql — LP가 선정하며 붙인 조건 (D47, LP L55)
-- =============================================================================
-- LP ERP가 출자 제안을 확약으로 응답할 때 선정 조건을 함께 보낸다 (그 GP 하나와 맺은 약속):
--   formation_deadline(결성 기한) · max_commitment_ratio(결성액 대비 출자 비율 상한) · min_fund_size_amount(최소 결성 규모)
--   · key_person_condition(핵심 운용 인력 조건) · program_name(어느 출자사업 선정인지)
-- GP 모집 현황의 "앵커 조건"이 이것으로 필요한 최소 결성액 · 남은 모집액 · 기한을 계산한다. 값은 LP가 원본 (GP는 받은 그대로)
-- =============================================================================

alter table lp_proposals add column lp_selection_terms jsonb;
comment on column lp_proposals.lp_selection_terms is 'LP ERP 선정 조건 (확약 응답에 함께 옴, D47/L55): formation_deadline · max_commitment_ratio · min_fund_size_amount · key_person_condition · program_name';

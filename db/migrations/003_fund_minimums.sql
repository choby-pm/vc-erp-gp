-- =============================================================================
-- 003_fund_minimums.sql — 결성 주체 유형, 개인투자조합, 1좌 금액 (D29)
-- =============================================================================
-- 최소 결성액은 펀드 유형뿐 아니라 "누가 결성하는지"에 따라 달라진다.
--   · 벤처투자조합: 창업기획자 10억 원 이상 / 벤처투자회사·신기사 20억 원 이상
--   · 개인투자조합: 1억 원 이상, 1좌 금액 100만 원 이상
--   · 신기술사업투자조합: ⚠️ 기준 확인 필요 (docs/98_practice_check.md)
-- 기준 금액 자체는 법령 변경에 대비해 DB가 아니라 lib/rules/fund-minimums.ts 한 곳에 둔다.
-- =============================================================================

-- 1. 결성 주체 유형. 한 회사가 벤처투자회사·신기사 자격을 함께 가질 수 있어 펀드마다 저장한다
alter table funds add column gp_type text not null default 'venture_capital'
  check (gp_type in ('accelerator', 'venture_capital', 'new_tech_finance', 'other'));
alter table funds alter column gp_type drop default;

comment on column funds.gp_type is
  '결성 주체: accelerator(창업기획자) / venture_capital(벤처투자회사) / new_tech_finance(신기사) / other(개인 등)';

-- 2. 펀드 유형에 개인투자조합 추가
alter table funds drop constraint funds_fund_type_check;
alter table funds add constraint funds_fund_type_check
  check (fund_type in ('venture', 'individual', 'new_tech'));

-- 3. 1좌 금액. 조합원 약정액은 이 금액의 배수여야 한다 (BR-MEM-07, R2에서 검사)
alter table fund_terms add column unit_amount bigint not null default 1000000
  check (unit_amount > 0);
alter table fund_terms alter column unit_amount drop default;

comment on column fund_terms.unit_amount is '출자 1좌 금액 (원)';

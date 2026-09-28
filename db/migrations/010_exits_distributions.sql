-- =============================================================================
-- 010_exits_distributions.sql — 회수·분배·해산·청산 (R6, D37)
-- =============================================================================
-- exits / distributions / distribution_items 테이블은 001에서 만들어 두었다. 여기서는 R6 구현에 필요한 것만 더한다.
--
--   · 회수: 메모. 회수는 투자처럼 추가만 한다 (정정 기능은 고도화)
--   · 분배: 확정·지급 시각, 메모. 진행 중(초안·확정)인 분배는 조합당 1건 (BR-DIST-08)
--   · 회계: 분배금을 "출자금 반환"(원금 반환분)과 "이익 분배"(기준수익·초과수익·성과보수)로 나눈다 (D35 가정 해소)
-- =============================================================================

alter table exits add column memo text;

alter table distributions
  add column memo         text,
  add column confirmed_at timestamptz,
  add column paid_at      timestamptz;

-- BR-DIST-08: 진행 중인 분배는 조합당 하나 (누적 워터폴 계산이 앞 분배의 지급 결과를 기준으로 하기 때문)
create unique index distributions_one_open on distributions (fund_id) where status in ('draft', 'confirmed');
-- 최종 분배는 조합당 하나
create unique index distributions_one_final on distributions (fund_id) where is_final;

alter table distributions add constraint confirmed_has_time check (status = 'draft' or confirmed_at is not null);
alter table distributions add constraint paid_has_time check (status <> 'paid' or paid_at is not null);

-- 분배금 계정 분리: 3020 = 출자금 반환(원금), 3110 = 이익 분배(기준수익·초과수익·성과보수). 둘 다 자본 차감 계정
update accounts set name = '출자금반환', description = '분배금 중 원금 반환분 (자본 차감)' where code = '3020';
insert into accounts (code, name, category, normal_side, is_contra, sort_order, description) values
  ('3110', '이익분배금', 'equity', 'debit', true, 240, '분배금 중 기준수익·초과수익·성과보수 (자본 차감)');

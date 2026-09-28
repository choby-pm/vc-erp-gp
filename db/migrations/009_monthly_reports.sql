-- =============================================================================
-- 009_monthly_reports.sql — 정기 보고에 월간 주기 추가
-- =============================================================================
-- 분기·반기·연간 외에 월간 보고(기간 = 한 달)를 만들 수 있게 한다.
-- 기간 계산·중복 초안 검사·숫자 계산(BR-RPT-01~05)은 주기와 상관없이 같다.
-- =============================================================================

alter table reports drop constraint reports_period_type_check;
alter table reports add constraint reports_period_type_check
  check (period_type in ('monthly', 'quarterly', 'semiannual', 'annual'));

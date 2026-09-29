-- =============================================================================
-- 011_corrections.sql — 회수 취소 · 분배 취소 · 결산 재개 (D39)
-- =============================================================================
-- 업무 기록은 지우지 않는다. 틀렸으면 "취소 표시 + 역분개(+ 원장 취소 행)"로 정정하고 이력을 남긴다.
--
--   · 회수 취소: exits 에 취소 표시. 취소된 회수는 포트폴리오·현금·보고서 합계에서 빠진다. 처분 분개는 역분개
--   · 분배 취소: 확정·지급한 분배를 cancelled 로. 지급했던 분배면 조합원 원장에 취소 행(음수) + 분배 분개 역분개
--   · 결산 재개: fiscal_closings 에 재개 표시. 결산 분개를 역분개하고 기간 잠금을 푼다. 다시 결산할 수 있다
-- =============================================================================

-- 1. 회수 취소 ------------------------------------------------------------------

alter table exits
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid references users(id),
  add column cancel_reason text;
alter table exits add constraint cancel_has_actor check ((cancelled_at is null) = (cancelled_by is null));

-- 포트폴리오: 취소된 회수는 빼고 계산한다 (나머지는 001과 같다)
create or replace view v_portfolio as
with inv as (
  select fund_id, company_id,
         sum(investment_amount)::bigint as invested_amount,
         count(*)::int                  as investment_count,
         min(investment_date)           as first_investment_date
  from investments
  group by fund_id, company_id
),
ex as (
  select fund_id, company_id,
         sum(proceeds_amount)::bigint   as proceeds_amount,
         sum(cost_basis_amount)::bigint as exited_cost_amount
  from exits
  where cancelled_at is null
  group by fund_id, company_id
),
latest_val as (
  select distinct on (fund_id, company_id)
         fund_id, company_id, fair_value_amount, valuation_date
  from valuations
  order by fund_id, company_id, valuation_date desc
)
select
  inv.fund_id,
  inv.company_id,
  co.name as company_name,
  inv.invested_amount,
  inv.investment_count,
  inv.first_investment_date,
  coalesce(ex.proceeds_amount, 0)                              as proceeds_amount,
  coalesce(ex.exited_cost_amount, 0)                           as exited_cost_amount,
  inv.invested_amount - coalesce(ex.exited_cost_amount, 0)     as remaining_cost_amount,
  case
    when inv.invested_amount - coalesce(ex.exited_cost_amount, 0) = 0 then 'exited'
    when coalesce(ex.exited_cost_amount, 0) > 0                         then 'partially_exited'
    else 'holding'
  end                                                          as holding_status,
  case
    when inv.invested_amount - coalesce(ex.exited_cost_amount, 0) = 0 then 0
    else coalesce(lv.fair_value_amount, inv.invested_amount - coalesce(ex.exited_cost_amount, 0))
  end                                                          as current_value_amount,
  lv.valuation_date                                            as latest_valuation_date,
  case when coalesce(ex.exited_cost_amount, 0) > 0
       then round(coalesce(ex.proceeds_amount, 0)::numeric / ex.exited_cost_amount, 2)
  end                                                          as realized_moic
from inv
join companies co       on co.id = inv.company_id
left join ex            on ex.fund_id = inv.fund_id and ex.company_id = inv.company_id
left join latest_val lv on lv.fund_id = inv.fund_id and lv.company_id = inv.company_id;


-- 2. 분배 취소 ------------------------------------------------------------------

alter table distributions drop constraint distributions_status_check;
alter table distributions add constraint distributions_status_check check (status in ('draft', 'confirmed', 'paid', 'cancelled'));
alter table distributions
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid references users(id),
  add column cancel_reason text;
alter table distributions add constraint cancelled_has_time check ((status = 'cancelled') = (cancelled_at is not null));

-- 최종 분배는 취소된 것을 빼고 조합당 하나
drop index distributions_one_final;
create unique index distributions_one_final on distributions (fund_id) where is_final and status <> 'cancelled';


-- 3. 결산 재개 ------------------------------------------------------------------

alter table fiscal_closings
  add column reopened_at   timestamptz,
  add column reopened_by   uuid references users(id),
  add column reopen_reason text;
alter table fiscal_closings add constraint reopen_has_actor check ((reopened_at is null) = (reopened_by is null));

-- 재개한 결산은 이력으로 남기고, 같은 사업연도를 다시 결산할 수 있게 한다 (유효한 결산은 연도당 하나)
alter table fiscal_closings drop constraint fiscal_closings_fund_id_fiscal_year_key;
create unique index fiscal_closings_one_active on fiscal_closings (fund_id, fiscal_year) where reopened_at is null;
comment on table fiscal_closings is '사업연도 결산 (결산한 기간은 분개 잠금, 재개하면 reopened_at)';

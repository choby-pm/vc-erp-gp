-- =============================================================================
-- 007_fund_expenses.sql — 조합 기타 비용 (D34)
-- =============================================================================
-- 관리보수 외에 조합 재산에서 나가는 비용 (회계감사 수수료, 수탁 보수, 사무관리 보수, 설립 비용 등).
-- 지금까지는 기록할 곳이 없어 현금 잔액·투자 가능 잔액에 반영되지 않았다.
--
--   · 비용은 조합 → 외부로 나가는 돈이라 조합원 원장(ledger_entries)이 아니라 이 테이블에 둔다 (관리보수와 같은 이유)
--   · 잘못 기록하면 지우지 않고 취소 표시(cancelled_at)를 남긴다. 취소된 비용은 합계에서 빠진다
--   · 투자 가능 잔액 = 약정 총액 − 누적 투자 − 누적 관리보수 − 누적 기타 비용 (실무 확인 12번 ⚠️)
--   · 현금 잔액     = 납입 + 회수 − 투자 − 관리보수 − 기타 비용 − 분배
-- =============================================================================

create table fund_expenses (
  id            uuid primary key default gen_random_uuid(),
  fund_id       uuid not null references funds(id),
  expense_type  text not null check (expense_type in ('audit', 'custody', 'administration', 'organization', 'legal', 'tax', 'other')),
  description   text not null,                      -- 예: 2026 사업연도 회계감사 수수료
  payee         text,                               -- 지급처
  amount        bigint not null check (amount > 0),
  paid_date     date not null,
  cancelled_at  timestamptz,                        -- 취소 시각. 비어 있으면 유효
  cancelled_by  uuid references users(id),
  cancel_reason text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint cancel_has_actor check ((cancelled_at is null) = (cancelled_by is null))
);
create index on fund_expenses (fund_id, paid_date);
comment on table fund_expenses is '조합 기타 비용 (관리보수 외, 취소 이력 포함)';

create trigger fund_expenses_set_updated_at before update on fund_expenses
  for each row execute function set_updated_at();


-- 대시보드 요약에 기타 비용을 반영한다. 기존 열의 순서·이름은 그대로 두고 total_expense_amount 를 맨 끝에 추가한다
create or replace view v_fund_summary as
with led as (
  select fund_id,
         coalesce(sum(amount) filter (where entry_type = 'commitment'), 0)::bigint   as total_commitment_amount,
         coalesce(sum(amount) filter (where entry_type = 'contribution'), 0)::bigint as total_paid_amount,
         coalesce(sum(amount) filter (where entry_type = 'distribution'), 0)::bigint as total_distributed_amount
  from ledger_entries
  group by fund_id
),
inv as (
  select fund_id,
         sum(investment_amount)::bigint                                       as total_invested_amount,
         coalesce(sum(investment_amount) filter (where is_primary_purpose), 0)::bigint as primary_purpose_amount
  from investments
  group by fund_id
),
fee as (
  select fund_id, sum(fee_amount)::bigint as total_fee_amount
  from management_fee_charges
  group by fund_id
),
exp as (
  select fund_id, sum(amount)::bigint as total_expense_amount
  from fund_expenses
  where cancelled_at is null
  group by fund_id
),
port as (
  select fund_id,
         sum(proceeds_amount)::bigint       as total_proceeds_amount,
         sum(remaining_cost_amount)::bigint as invested_balance_amount,
         sum(current_value_amount)::bigint  as total_current_value_amount
  from v_portfolio
  group by fund_id
)
select
  f.id as fund_id,
  f.name,
  f.status,
  f.formation_date,
  (f.formation_date + make_interval(years => f.term_years))::date              as maturity_date,
  (f.formation_date + make_interval(years => f.investment_period_years))::date as investment_period_end_date,
  f.target_amount,
  coalesce(led.total_commitment_amount, 0)    as total_commitment_amount,
  coalesce(led.total_paid_amount, 0)          as total_paid_amount,
  coalesce(inv.total_invested_amount, 0)      as total_invested_amount,
  coalesce(fee.total_fee_amount, 0)           as total_fee_amount,
  coalesce(port.total_proceeds_amount, 0)     as total_proceeds_amount,
  coalesce(led.total_distributed_amount, 0)   as total_distributed_amount,
  coalesce(port.invested_balance_amount, 0)   as invested_balance_amount,
  coalesce(port.total_current_value_amount, 0) as total_current_value_amount,

  -- 투자 가능 잔액 = 약정 총액 − 누적 투자 − 누적 관리보수 − 누적 기타 비용 (BR-INV-03, D34)
  coalesce(led.total_commitment_amount, 0) - coalesce(inv.total_invested_amount, 0) - coalesce(fee.total_fee_amount, 0)
    - coalesce(exp.total_expense_amount, 0)
                                              as investable_amount,
  -- 현금 잔액 = 납입 + 회수 − 투자 − 관리보수 − 기타 비용 − 분배 (BR-INV-04, D34)
  coalesce(led.total_paid_amount, 0) + coalesce(port.total_proceeds_amount, 0)
    - coalesce(inv.total_invested_amount, 0) - coalesce(fee.total_fee_amount, 0) - coalesce(exp.total_expense_amount, 0)
    - coalesce(led.total_distributed_amount, 0)
                                              as cash_amount,
  -- 주목적 투자 비율 = 주목적 투자액 ÷ 약정 총액 (BR-INV-06)
  case when coalesce(led.total_commitment_amount, 0) > 0
       then round(coalesce(inv.primary_purpose_amount, 0)::numeric / led.total_commitment_amount, 6)
  end                                         as primary_purpose_ratio,
  coalesce(exp.total_expense_amount, 0)       as total_expense_amount
from funds f
left join led  on led.fund_id  = f.id
left join inv  on inv.fund_id  = f.id
left join fee  on fee.fund_id  = f.id
left join exp  on exp.fund_id  = f.id
left join port on port.fund_id = f.id;

comment on view v_fund_summary is '조합 대시보드 요약 (기타 비용 반영, D34)';

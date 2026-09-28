-- =============================================================================
-- 006_fund_rosters.sql — 조합원 명부 확정 기록 (D33)
-- =============================================================================
-- 명부 확정은 "확약(약속)을 약정(법적 금액)으로 바꾸는" 작업이다 (BR-MEM-01~05).
-- 확정할 때 조합원별 약정 원장 행을 만드는데, 원장 행은 원인 문서(source_id)가 반드시 있어야 한다 (BR-LED-03).
-- 그 원인 문서가 이 명부 확정 기록이다.
--
--   · 결성총회 가결 전에는 명부를 취소하고 다시 확정할 수 있다 (BR-MEM-05)
--     취소하면 이 행에 취소 시각을 넣고, 약정 원장은 취소 행(음수)으로 되돌린다. 행은 지우지 않는다
--   · 조합원(fund_members) 행도 원장이 참조하므로 지우지 않는다. 다시 확정하면 같은 조합원 행을 재사용한다
--   · 조합당 유효한(취소되지 않은) 명부는 1개
-- =============================================================================

create table fund_rosters (
  id              uuid primary key default gen_random_uuid(),
  fund_id         uuid not null references funds(id),
  confirmed_date  date not null,                     -- 명부 확정일 = 약정일 (원장 entry_date)
  cancelled_at    timestamptz,                       -- 명부 취소 시각. 비어 있으면 유효한 명부
  cancelled_by    uuid references users(id),
  cancel_reason   text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint cancel_has_actor check ((cancelled_at is null) = (cancelled_by is null))
);
create index on fund_rosters (fund_id);

-- 조합당 유효한 명부는 1개
create unique index fund_rosters_one_active on fund_rosters (fund_id) where cancelled_at is null;

comment on table fund_rosters is '조합원 명부 확정 기록 (약정 원장의 원인 문서, 취소 이력 포함)';

create trigger fund_rosters_set_updated_at before update on fund_rosters
  for each row execute function set_updated_at();

-- =============================================================================
-- 005_staff_and_fund_managers.sql — 구성원과 조합 운용 인력 (D31, D32)
-- =============================================================================
-- 조합을 결성하려면 조합 운용 인력을 지정해야 하고, 운용 인력은 운용사 구성원 중에서 고른다.
--
--   구성원(staff)        운용사에 소속된 사람. 로그인 계정(users)과 1:1로 연결할 수 있다
--   조합 운용 인력        조합 × 구성원 × 역할. 교체 이력이 남도록 시작일·종료일로 쌓는다
--   (fund_managers)
--
-- 주의: "조합원"(fund_members, 조합에 출자한 GP·LP)과 "구성원"(staff, 회사 직원)은 다른 개념이다.
-- =============================================================================


-- 1. 구성원 -------------------------------------------------------------------

create table staff (
  id          uuid primary key default gen_random_uuid(),
  employee_no text not null unique,                 -- 사번
  name        text not null,
  position    text not null,                        -- 직위 (예: 대표이사, 파트너, 수석심사역)
  department  text,                                 -- 부서 (예: 투자본부, 경영지원팀)
  email       text,                                 -- 업무 이메일. 로그인 계정을 만들면 로그인 ID가 된다
  phone       text,
  hired_date  date not null,                        -- 입사일
  left_date   date,                                 -- 퇴사일. 비어 있으면 재직 중
  user_id     uuid unique references users(id),     -- 연결된 로그인 계정 (없을 수 있음)
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint left_after_hired check (left_date is null or left_date >= hired_date)
);
comment on table staff is '운용사 구성원 (로그인 계정과 1:1 연결 가능)';

create trigger staff_set_updated_at before update on staff
  for each row execute function set_updated_at();

-- 퇴사·계정 중지 시 로그인을 막는다. 행은 지우지 않아 작성자 기록이 유지된다
alter table users add column disabled_at timestamptz;
comment on column users.disabled_at is '계정 중지 시각. 채워져 있으면 로그인할 수 없다';


-- 2. 조합 운용 인력 -----------------------------------------------------------

-- 결성 이후 운용 인력 교체는 총회 가결 안건이 필요하다 (BR-MGR-04)
alter table agendas drop constraint agendas_agenda_type_check;
alter table agendas add constraint agendas_agenda_type_check
  check (agenda_type in ('formation', 'terms_amendment', 'manager_change', 'report_approval', 'dissolution', 'other'));

create table fund_managers (
  id                     uuid primary key default gen_random_uuid(),
  fund_id                uuid not null references funds(id),
  staff_id               uuid not null references staff(id),
  role                   text not null check (role in ('lead', 'key', 'general')),
                         -- lead: 대표펀드매니저 / key: 핵심운용인력 / general: 운용인력
  start_date             date not null,
  end_date               date,                                   -- 비어 있으면 현재 담당 중
  appointed_by_agenda_id uuid references agendas(id),            -- 결성 이후 선임의 근거 안건
  ended_by_agenda_id     uuid references agendas(id),            -- 결성 이후 해임의 근거 안건
  created_by             uuid references users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint end_after_start check (end_date is null or end_date >= start_date)
);
create index on fund_managers (staff_id);

-- 한 구성원은 한 조합에서 동시에 한 역할만 맡는다
create unique index fund_managers_one_active_role
  on fund_managers (fund_id, staff_id) where end_date is null;
-- 대표펀드매니저는 조합당 동시에 1명
create unique index fund_managers_one_active_lead
  on fund_managers (fund_id) where role = 'lead' and end_date is null;

comment on table fund_managers is '조합 운용 인력 (조합 × 구성원 × 역할, 교체 이력 포함)';

create trigger fund_managers_set_updated_at before update on fund_managers
  for each row execute function set_updated_at();

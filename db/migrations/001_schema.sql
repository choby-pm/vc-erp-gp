-- =============================================================================
-- 001_schema.sql — VC ERP (GP) 최초 스키마
-- =============================================================================
-- 기준 문서
--   docs/02_glossary.md       이름 규칙과 상태값
--   docs/03_db_design.md      테이블 28개, 뷰 4개, 설계 원칙
--   docs/04_business_rules.md DB가 직접 막는 규칙 (5장)
--
-- 공통 규칙 (D3, D6)
--   · 기본 키: uuid (gen_random_uuid)
--   · 금액: bigint, 원 단위 정수
--   · 비율: numeric(7,6), 0 이상 1 이하 소수 (2% = 0.02)
--   · 상태·구분값: text + check 제약
--   · created_by: 사람이 만든 행의 작성자. 시스템이 자동으로 만든 행은 비워둔다
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 확장 기능과 공통 함수
-- -----------------------------------------------------------------------------

-- 관리보수 청구 기간 겹침을 DB에서 막기 위해 필요 (management_fee_charges 참고)
create extension if not exists btree_gist;

-- 행이 수정될 때 updated_at 을 자동으로 현재 시각으로 바꾼다
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 추가만 허용하는 테이블에서 수정·삭제를 막는다 (D5)
create function forbid_modification() returns trigger
language plpgsql as $$
begin
  raise exception '% 테이블은 수정·삭제할 수 없습니다. 정정은 취소 행을 추가하세요.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;


-- =============================================================================
-- 1. 기준 정보
-- =============================================================================

-- GP 사용자. MVP는 권한 구분 없이 1종. LP 계정은 LP 시스템 DB에 둔다 (D2)
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  password_hash text not null,          -- 복원할 수 없게 변환한 값. 원문 비밀번호는 저장하지 않는다
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table users is 'GP 사용자 (로그인 계정)';

-- 출자자. 펀드에 종속시키지 않아 한 LP가 여러 펀드에 출자해도 한 행으로 관리된다.
-- 이 id가 LP 시스템 계정과 연결된다
create table limited_partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  lp_type         text not null check (lp_type in ('policy', 'pension', 'financial', 'corporate', 'individual', 'other')),
  registration_no text unique,          -- 사업자등록번호. 개인은 비움
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  memo            text,                 -- GP 내부 메모 (LP 비공개)
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table limited_partners is '출자자(LP) 기준 정보';

-- 검토 중인 기업과 투자한 기업을 한 테이블에 둔다 (D10).
-- 포트폴리오사는 별도 테이블이 아니라 v_portfolio 뷰로 본다
create table companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  registration_no text unique,
  sector          text,
  ceo_name        text,
  founded_date    date,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table companies is '기업 기준 정보 (검토 기업 + 투자 기업)';


-- =============================================================================
-- 2. 펀드
-- =============================================================================

-- 약정 총액, 만기일처럼 계산되는 값은 저장하지 않는다 (D7, v_fund_summary 에서 계산)
create table funds (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  fund_type                   text not null check (fund_type in ('venture', 'new_tech')),
  status                      text not null default 'planning'
                              check (status in ('planning', 'fundraising', 'formed', 'operating', 'dissolved', 'liquidated')),
  target_amount               bigint not null check (target_amount > 0),
  term_years                  integer not null check (term_years > 0),
  investment_period_years     integer not null check (investment_period_years > 0),
  formation_date              date,
  registration_applied_date   date,
  registration_completed_date date,
  dissolution_date            date,
  liquidation_date            date,
  created_by                  uuid references users(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint investment_period_within_term check (investment_period_years <= term_years)
);
comment on table funds is '펀드(조합)';

-- 총회. 결성총회도 한 종류로 다룬다
create table general_meetings (
  id           uuid primary key default gen_random_uuid(),
  fund_id      uuid not null references funds(id),
  meeting_type text not null check (meeting_type in ('formation', 'regular', 'extraordinary', 'dissolution')),
  meeting_date date not null,
  location     text,
  status       text not null default 'scheduled' check (status in ('scheduled', 'held', 'cancelled')),
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on general_meetings (fund_id);
comment on table general_meetings is '조합원 총회';

-- 안건. 가결 기준(quorum_ratio)은 안건을 만들 때 규약에서 복사해 고정한다 (BR-VOTE-04)
create table agendas (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references general_meetings(id),
  agenda_no    integer not null check (agenda_no > 0),
  agenda_type  text not null check (agenda_type in ('formation', 'terms_amendment', 'report_approval', 'dissolution', 'other')),
  title        text not null,
  description  text,
  quorum_ratio numeric(7,6) not null check (quorum_ratio > 0 and quorum_ratio <= 1),
  result       text not null default 'pending' check (result in ('pending', 'passed', 'rejected')),
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (meeting_id, agenda_no)
);
comment on table agendas is '총회 안건';

-- 규약 핵심 조건. 변경할 때마다 조건 전체를 새 버전으로 한 행 추가한다 (D9)
create table fund_terms (
  id                        uuid primary key default gen_random_uuid(),
  fund_id                   uuid not null references funds(id),
  version                   integer not null check (version >= 1),
  primary_purpose           text not null,
  primary_purpose_min_ratio numeric(7,6) not null check (primary_purpose_min_ratio between 0 and 1),
  gp_commitment_min_ratio   numeric(7,6) not null check (gp_commitment_min_ratio between 0 and 1),
  management_fee_rate       numeric(7,6) not null check (management_fee_rate between 0 and 1),
  management_fee_rate_after numeric(7,6) not null check (management_fee_rate_after between 0 and 1),
  carry_rate                numeric(7,6) not null check (carry_rate between 0 and 1),
  hurdle_rate               numeric(7,6) not null check (hurdle_rate between 0 and 1),
  quorum_ratio              numeric(7,6) not null check (quorum_ratio > 0 and quorum_ratio <= 1),
  effective_date            date not null,
  amended_by_agenda_id      uuid unique references agendas(id),  -- 안건 하나당 새 버전 하나 (BR-TERM-02)
  created_by                uuid references users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (fund_id, version),
  -- 최초 버전(1)만 근거 안건이 없고, 이후 버전은 반드시 근거 안건이 있어야 한다
  constraint amendment_requires_agenda check ((version = 1) = (amended_by_agenda_id is null))
);
comment on table fund_terms is '규약 핵심 조건 (버전 관리)';

create table related_institutions (
  id               uuid primary key default gen_random_uuid(),
  fund_id          uuid not null references funds(id),
  institution_type text not null check (institution_type in ('custodian', 'administrator', 'auditor')),
  name             text not null,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on related_institutions (fund_id);
comment on table related_institutions is '관계 기관 (수탁은행, 사무관리사, 회계감사인)';


-- =============================================================================
-- 3. 모집·조합원
-- =============================================================================

-- 모집 단계의 "확약"(바뀔 수 있는 약속)을 기록한다.
-- 결성 시 확정되는 "약정"(법적 금액)은 원장에만 기록된다
create table lp_proposals (
  id              uuid primary key default gen_random_uuid(),
  fund_id         uuid not null references funds(id),
  lp_id           uuid not null references limited_partners(id),
  status          text not null default 'proposed' check (status in ('proposed', 'reviewing', 'committed', 'declined')),
  proposed_amount bigint check (proposed_amount > 0),
  loc_amount      bigint check (loc_amount > 0),
  proposed_date   date not null,
  decided_date    date,
  memo            text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (fund_id, lp_id),
  constraint committed_requires_loc check (status <> 'committed' or loc_amount is not null)  -- BR-PROP-02
);
comment on table lp_proposals is '출자 제안 (펀드 × LP)';

-- GP도 자기 펀드에 출자하는 조합원이라 LP와 같은 테이블에 둔다.
-- 약정액 컬럼이 없는 이유: 돈의 원본은 원장 하나 (원칙 1)
create table fund_members (
  id          uuid primary key default gen_random_uuid(),
  fund_id     uuid not null references funds(id),
  member_type text not null check (member_type in ('gp', 'lp')),
  lp_id       uuid references limited_partners(id),
  proposal_id uuid unique references lp_proposals(id),
  joined_date date not null,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (fund_id, lp_id),
  unique (id, fund_id),  -- 원장이 "이 조합원이 이 펀드 소속"임을 함께 검사하기 위한 키
  constraint lp_member_has_lp check ((member_type = 'lp') = (lp_id is not null))
);
-- 펀드당 GP 조합원은 1명
create unique index fund_members_one_gp_per_fund on fund_members (fund_id) where member_type = 'gp';
comment on table fund_members is '조합원 (GP + LP)';


-- =============================================================================
-- 4. 돈의 원장
-- =============================================================================

-- 조합원 돈의 유일한 원본 (원칙 1). 확정된 돈만 기록한다: 약정 확정, 실제 납입, 실제 지급.
-- 캐피탈콜 "요청"은 청구서일 뿐이라 여기에 넣지 않는다 (D8).
-- 수정·삭제 불가. 틀리면 반대 금액의 취소 행을 추가한다 (D5)
create table ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  fund_id        uuid not null references funds(id),
  member_id      uuid not null,
  entry_type     text not null check (entry_type in ('commitment', 'contribution', 'distribution')),
  amount         bigint not null,
  entry_date     date not null,
  source_type    text not null check (source_type in ('formation', 'capital_call_item', 'distribution_item', 'terms_amendment')),
  source_id      uuid not null,        -- 원인 문서. 문서 종류가 여러 개라 외래 키 대신 서버에서 검사 (BR-LED-03)
  reversal_of_id uuid unique references ledger_entries(id),  -- 한 행은 한 번만 취소 가능 (BR-LED-02)
  memo           text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),

  -- 조합원이 반드시 같은 펀드 소속이어야 한다
  foreign key (member_id, fund_id) references fund_members (id, fund_id),
  -- 일반 행은 양수, 취소 행만 음수
  constraint amount_sign check (
    (reversal_of_id is null and amount > 0) or
    (reversal_of_id is not null and amount < 0)
  )
);
create index on ledger_entries (fund_id, member_id);
create index on ledger_entries (source_type, source_id);
comment on table ledger_entries is '조합원 원장 (추가만 가능)';

create trigger ledger_entries_no_update before update or delete on ledger_entries
  for each row execute function forbid_modification();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function forbid_modification();


-- =============================================================================
-- 5. 출자 요청 (캐피탈콜)
-- =============================================================================

create table capital_calls (
  id                uuid primary key default gen_random_uuid(),
  fund_id           uuid not null references funds(id),
  call_no           integer not null check (call_no > 0),
  is_initial        boolean not null default false,
  total_call_amount bigint not null check (total_call_amount > 0),
  call_date         date not null,
  due_date          date not null,
  purpose           text,
  status            text not null default 'draft' check (status in ('draft', 'issued', 'closed')),
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (fund_id, call_no),
  constraint due_after_call check (due_date >= call_date)  -- BR-CALL-06
);
comment on table capital_calls is '출자 요청 (펀드 단위)';

-- 조합원별 요청액을 계산 결과 그대로 저장한다 (원칙 4).
-- 납입액 컬럼이 없는 이유: 납입은 원장에 기록되고 상태는 v_capital_call_item_status 에서 계산
create table capital_call_items (
  id              uuid primary key default gen_random_uuid(),
  capital_call_id uuid not null references capital_calls(id),
  member_id       uuid not null references fund_members(id),
  ownership_ratio numeric(7,6) not null check (ownership_ratio between 0 and 1),  -- 요청 당시 지분율
  call_amount     bigint not null check (call_amount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (capital_call_id, member_id)
);
create index on capital_call_items (member_id);
comment on table capital_call_items is '조합원별 출자 요청';


-- =============================================================================
-- 6. 딜 파이프라인과 투자
-- =============================================================================

create table deals (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  target_fund_id  uuid references funds(id),
  stage           text not null default 'sourcing'
                  check (stage in ('sourcing', 'reviewing', 'ic', 'approved', 'dropped')),
  expected_amount bigint check (expected_amount > 0),
  owner_id        uuid not null references users(id),
  sourced_date    date not null,
  drop_reason     text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint dropped_requires_reason check (stage <> 'dropped' or drop_reason is not null),  -- BR-DEAL-03
  constraint approved_requires_fund check (                                                   -- BR-DEAL-04
    stage <> 'approved' or (target_fund_id is not null and expected_amount is not null)
  )
);
create index on deals (stage);
create index on deals (company_id);
comment on table deals is '딜 (투자 검토 건)';

-- deals.stage 는 현재 단계만 보여준다. 이력이 있어야 단계별 소요 기간과 드롭 지점을 분석할 수 있다
create table deal_stage_history (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references deals(id),
  from_stage text check (from_stage in ('sourcing', 'reviewing', 'ic', 'approved', 'dropped')),
  to_stage   text not null check (to_stage in ('sourcing', 'reviewing', 'ic', 'approved', 'dropped')),
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);
create index on deal_stage_history (deal_id);
comment on table deal_stage_history is '딜 단계 이력 (추가만 가능)';

create trigger deal_stage_history_no_update before update or delete on deal_stage_history
  for each row execute function forbid_modification();

create table deal_notes (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references deals(id),
  stage      text not null check (stage in ('sourcing', 'reviewing', 'ic', 'approved', 'dropped')),
  content    text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on deal_notes (deal_id);
comment on table deal_notes is '딜 메모';

-- 투자 1건 = 1행. 같은 기업에 후속 투자하면 행이 추가된다.
-- 잔액 초과·현금 부족 검사는 여러 테이블을 봐야 해서 서버가 한다 (BR-INV-03, 04)
create table investments (
  id                 uuid primary key default gen_random_uuid(),
  fund_id            uuid not null references funds(id),
  company_id         uuid not null references companies(id),
  deal_id            uuid references deals(id),
  investment_date    date not null,
  investment_amount  bigint not null check (investment_amount > 0),
  security_type      text not null check (security_type in ('common', 'preferred', 'rcps', 'cb', 'bw', 'other')),
  shares             bigint check (shares > 0),
  price_per_share    bigint check (price_per_share > 0),
  is_follow_on       boolean not null default false,
  is_primary_purpose boolean not null default false,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint new_investment_requires_deal check (is_follow_on or deal_id is not null)  -- BR-INV-01
);
create index on investments (fund_id, company_id);
-- 한 딜에서 신규 투자는 1건만 (BR-INV-01)
create unique index investments_one_new_per_deal on investments (deal_id) where not is_follow_on;
comment on table investments is '투자 집행';

-- 평가는 투자 건이 아니라 펀드가 보유한 기업 지분 전체 단위
create table valuations (
  id                uuid primary key default gen_random_uuid(),
  fund_id           uuid not null references funds(id),
  company_id        uuid not null references companies(id),
  valuation_date    date not null,
  fair_value_amount bigint not null check (fair_value_amount >= 0),
  method            text,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (fund_id, company_id, valuation_date)
);
comment on table valuations is '기업가치 평가';


-- =============================================================================
-- 7. 보수
-- =============================================================================

-- 계산 결과만이 아니라 계산 재료(기준 금액, 요율, 기간)를 함께 저장해
-- "이 보수가 왜 이 금액인가"에 행 하나로 답할 수 있게 한다
create table management_fee_charges (
  id            uuid primary key default gen_random_uuid(),
  fund_id       uuid not null references funds(id),
  period_start  date not null,
  period_end    date not null,
  fee_basis     text not null check (fee_basis in ('commitment', 'invested')),
  basis_amount  bigint not null check (basis_amount >= 0),
  fee_rate      numeric(7,6) not null check (fee_rate between 0 and 1),
  fee_amount    bigint not null check (fee_amount >= 0),
  charged_date  date not null,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint period_order check (period_end >= period_start),
  -- 같은 펀드의 청구 기간은 서로 겹칠 수 없다 (BR-FEE-01)
  constraint no_overlapping_periods exclude using gist (
    fund_id with =,
    daterange(period_start, period_end, '[]') with &&
  )
);
comment on table management_fee_charges is '관리보수 청구';


-- =============================================================================
-- 8. 총회 의결·정기 보고
-- =============================================================================

-- 의결 당시 지분율을 의결권으로 고정해 저장한다 (원칙 4)
create table votes (
  id                 uuid primary key default gen_random_uuid(),
  agenda_id          uuid not null references agendas(id),
  member_id          uuid not null references fund_members(id),
  choice             text not null check (choice in ('for', 'against', 'abstain')),
  voting_power_ratio numeric(7,6) not null check (voting_power_ratio between 0 and 1),
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (agenda_id, member_id)
);
comment on table votes is '의결 (안건 × 조합원)';

-- 발행 시점 숫자를 snapshot 에 얼려 저장한다. 초안은 조회할 때마다 최신 값으로 계산 (BR-RPT-02, 03)
create table reports (
  id           uuid primary key default gen_random_uuid(),
  fund_id      uuid not null references funds(id),
  period_type  text not null check (period_type in ('quarterly', 'semiannual', 'annual')),
  period_start date not null,
  period_end   date not null,
  snapshot     jsonb,
  gp_comment   text,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint period_order check (period_end >= period_start),
  constraint published_has_snapshot check (status <> 'published' or snapshot is not null)
);
create index on reports (fund_id);
comment on table reports is '정기 보고';


-- =============================================================================
-- 9. 회수·분배
-- =============================================================================

-- 한 기업을 여러 번 나눠 회수할 수 있어 회수마다 해당 원금을 함께 기록한다
create table exits (
  id                uuid primary key default gen_random_uuid(),
  fund_id           uuid not null references funds(id),
  company_id        uuid not null references companies(id),
  exit_type         text not null check (exit_type in ('ipo', 'trade_sale', 'm_and_a', 'redemption', 'write_off')),
  exit_date         date not null,
  proceeds_amount   bigint not null check (proceeds_amount >= 0),
  cost_basis_amount bigint not null check (cost_basis_amount > 0),
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint write_off_has_no_proceeds check (exit_type <> 'write_off' or proceeds_amount = 0)  -- BR-EXIT-04
);
create index on exits (fund_id, company_id);
comment on table exits is '회수';

create table distributions (
  id                   uuid primary key default gen_random_uuid(),
  fund_id              uuid not null references funds(id),
  distribution_no      integer not null check (distribution_no > 0),
  distribution_date    date not null,
  distributable_amount bigint not null check (distributable_amount > 0),
  is_final             boolean not null default false,
  status               text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  created_by           uuid references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (fund_id, distribution_no)
);
comment on table distributions is '분배 (펀드 단위)';

-- 분배금을 성격별(원금·기준수익·초과수익·성과보수)로 쪼개 저장해 워터폴 계산 과정이 남게 한다
create table distribution_items (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references distributions(id),
  member_id       uuid not null references fund_members(id),
  component       text not null check (component in ('return_of_capital', 'hurdle_return', 'profit', 'carried_interest')),
  amount          bigint not null check (amount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (distribution_id, member_id, component)
);
create index on distribution_items (member_id);
comment on table distribution_items is '조합원별 분배 (워터폴 단계별)';


-- =============================================================================
-- 10. LP 연동
-- =============================================================================

create table notices (
  id          uuid primary key default gen_random_uuid(),
  fund_id     uuid not null references funds(id),
  notice_type text not null check (notice_type in ('proposal', 'capital_call', 'report', 'meeting', 'distribution', 'general')),
  title       text not null,
  body        text not null,
  source_type text,
  source_id   uuid,
  status      text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at     timestamptz,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint sent_has_time check (status <> 'sent' or sent_at is not null)
);
create index on notices (fund_id);
comment on table notices is 'GP → LP 통지';

-- 수신자를 조합원이 아니라 출자자로 연결한다. 출자 제안은 아직 조합원이 아닌 LP 후보에게도 가기 때문
create table notice_recipients (
  id              uuid primary key default gen_random_uuid(),
  notice_id       uuid not null references notices(id),
  lp_id           uuid not null references limited_partners(id),
  acknowledged_at timestamptz,        -- LP 시스템이 연동 API로 알려줄 때만 기록 (BR-NTC-02)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (notice_id, lp_id)
);
create index on notice_recipients (lp_id);
comment on table notice_recipients is '통지 수신자';

-- 아웃박스 (D12). 데이터 변경과 같은 트랜잭션에서 저장하고, 별도 작업이 LP 시스템에 전송한다
create table integration_events (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null,
  aggregate_type text not null,
  aggregate_id   uuid not null,
  lp_id          uuid references limited_partners(id),  -- 전체 대상이면 비움
  payload        jsonb not null,
  status         text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts       integer not null default 0 check (attempts >= 0),
  last_error     text,
  delivered_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on integration_events (status, created_at);
create index on integration_events (lp_id, created_at);
comment on table integration_events is 'LP 시스템 연동 이벤트 (아웃박스)';


-- =============================================================================
-- 11. API 공통
-- =============================================================================

-- 돈이 움직이는 요청이 두 번 와도 한 번만 처리한다 (D22). 24시간 후 삭제
create table idempotency_keys (
  key             text not null,
  user_id         uuid not null references users(id),
  endpoint        text not null,
  request_hash    text not null,
  response_status integer not null,
  response_body   jsonb not null,
  created_at      timestamptz not null default now(),

  primary key (key, user_id)
);
comment on table idempotency_keys is 'API 중복 요청 방지';


-- =============================================================================
-- 12. updated_at 자동 갱신 트리거
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'limited_partners', 'companies', 'funds', 'general_meetings', 'agendas',
    'fund_terms', 'related_institutions', 'lp_proposals', 'fund_members',
    'capital_calls', 'capital_call_items', 'deals', 'deal_notes', 'investments', 'valuations',
    'management_fee_charges', 'votes', 'reports', 'exits', 'distributions', 'distribution_items',
    'notices', 'notice_recipients', 'integration_events'
  ] loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;


-- =============================================================================
-- 13. 계산용 뷰 (D7: 합계·잔액은 저장하지 않고 원본에서 계산)
-- =============================================================================

-- 조합원별 현황: 약정·지분율·요청·납입·잔여 약정·미납·분배
create view v_member_balances as
with ledger as (
  select
    member_id,
    coalesce(sum(amount) filter (where entry_type = 'commitment'), 0)::bigint   as commitment_amount,
    coalesce(sum(amount) filter (where entry_type = 'contribution'), 0)::bigint as paid_amount,
    coalesce(sum(amount) filter (where entry_type = 'distribution'), 0)::bigint as distributed_amount
  from ledger_entries
  group by member_id
),
called as (
  select i.member_id, sum(i.call_amount)::bigint as called_amount
  from capital_call_items i
  join capital_calls c on c.id = i.capital_call_id
  where c.status in ('issued', 'closed')           -- 초안은 아직 요청이 아니다
  group by i.member_id
),
fund_total as (
  select fund_id, sum(amount)::bigint as total_commitment_amount
  from ledger_entries
  where entry_type = 'commitment'
  group by fund_id
)
select
  m.id as member_id,
  m.fund_id,
  m.member_type,
  m.lp_id,
  coalesce(l.commitment_amount, 0)                                       as commitment_amount,
  case when ft.total_commitment_amount > 0
       then round(coalesce(l.commitment_amount, 0)::numeric / ft.total_commitment_amount, 6)
  end                                                                     as ownership_ratio,
  coalesce(c.called_amount, 0)                                            as called_amount,
  coalesce(l.paid_amount, 0)                                              as paid_amount,
  coalesce(l.commitment_amount, 0) - coalesce(c.called_amount, 0)         as unfunded_amount,
  coalesce(c.called_amount, 0) - coalesce(l.paid_amount, 0)               as unpaid_amount,
  coalesce(l.distributed_amount, 0)                                       as distributed_amount
from fund_members m
left join ledger l      on l.member_id = m.id
left join called c      on c.member_id = m.id
left join fund_total ft on ft.fund_id = m.fund_id;

comment on view v_member_balances is '조합원별 약정·납입·분배 현황';

-- 조합원별 납입 상태 (BR-CALL-11)
create view v_capital_call_item_status as
select
  i.id as item_id,
  i.capital_call_id,
  c.fund_id,
  i.member_id,
  i.call_amount,
  coalesce(p.paid_amount, 0) as paid_amount,
  case
    when c.status = 'draft'                              then null
    when coalesce(p.paid_amount, 0) >= i.call_amount     then 'paid'
    when current_date > c.due_date                       then 'overdue'
    when coalesce(p.paid_amount, 0) > 0                  then 'partial'
    else 'pending'
  end as payment_status
from capital_call_items i
join capital_calls c on c.id = i.capital_call_id
left join (
  select source_id, sum(amount)::bigint as paid_amount
  from ledger_entries
  where source_type = 'capital_call_item' and entry_type = 'contribution'
  group by source_id
) p on p.source_id = i.id;

comment on view v_capital_call_item_status is '조합원별 캐피탈콜 납입 상태';

-- 포트폴리오: 펀드 × 기업당 1행 (투자가 1건 이상인 경우)
-- 평가액: 전액 회수면 0, 평가 기록이 있으면 최신 평가액, 없으면 남은 원금 (BR-VAL-03)
create view v_portfolio as
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

comment on view v_portfolio is '펀드별 포트폴리오 (투자·회수·평가)';

-- 펀드 대시보드: 펀드 1개당 1행
create view v_fund_summary as
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

  -- 투자 가능 잔액 = 약정 총액 − 누적 투자 − 누적 관리보수 (BR-INV-03)
  coalesce(led.total_commitment_amount, 0) - coalesce(inv.total_invested_amount, 0) - coalesce(fee.total_fee_amount, 0)
                                              as investable_amount,
  -- 현금 잔액 = 납입 + 회수 − 투자 − 관리보수 − 분배 (BR-INV-04)
  coalesce(led.total_paid_amount, 0) + coalesce(port.total_proceeds_amount, 0)
    - coalesce(inv.total_invested_amount, 0) - coalesce(fee.total_fee_amount, 0) - coalesce(led.total_distributed_amount, 0)
                                              as cash_amount,
  -- 주목적 투자 비율 = 주목적 투자액 ÷ 약정 총액 (BR-INV-06)
  case when coalesce(led.total_commitment_amount, 0) > 0
       then round(coalesce(inv.primary_purpose_amount, 0)::numeric / led.total_commitment_amount, 6)
  end                                         as primary_purpose_ratio
from funds f
left join led  on led.fund_id  = f.id
left join inv  on inv.fund_id  = f.id
left join fee  on fee.fund_id  = f.id
left join port on port.fund_id = f.id;

comment on view v_fund_summary is '펀드 대시보드 요약';

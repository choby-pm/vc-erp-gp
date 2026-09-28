-- =============================================================================
-- 008_accounting.sql — 조합 회계: 계정과목·분개장·결산 (D35)
-- =============================================================================
-- 조합 운영에 회계 처리(결산·재무제표·외부감사)는 필수다. 업무 기록마다 복식부기 분개를 남긴다.
--
--   accounts          계정과목표 (모든 조합 공통)
--   journal_entries   분개 머리글. 추가만 가능, 정정은 역분개 (원장과 같은 원칙, D5)
--   journal_lines     분개 줄 (차변·대변). 한 분개의 차변 합 = 대변 합 (DB가 커밋 시점에 검사)
--   fiscal_closings   사업연도 결산. 결산한 기간에는 분개를 더 넣을 수 없다
--
-- 자동 분개는 업무 기록(납입·투자·관리보수·비용·회수·분배)과 같은 트랜잭션에서 만든다.
-- ⚠️ 사업연도(1/1~12/31 가정), 투자자산 평가 방식(원가법 가정)은 실무 확인 25·27번
-- =============================================================================

-- 1. 계정과목표 ---------------------------------------------------------------

create table accounts (
  code         text primary key,                   -- 예: 1010
  name         text not null,
  category     text not null check (category in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_side  text not null check (normal_side in ('debit', 'credit')),  -- 잔액이 늘어나는 쪽
  is_contra    boolean not null default false,     -- 차감 계정 (예: 분배금은 자본을 줄인다)
  sort_order   integer not null,
  description  text
);
comment on table accounts is '계정과목표 (모든 조합 공통)';

insert into accounts (code, name, category, normal_side, is_contra, sort_order, description) values
  ('1010', '현금및현금성자산',   'asset',     'debit',  false, 10,  '보통예금 등 조합 계좌'),
  ('1110', '투자자산',           'asset',     'debit',  false, 20,  '포트폴리오 지분·채권 (취득원가)'),
  ('1120', '투자자산평가조정',   'asset',     'debit',  false, 21,  '공정가치 평가 시 원가와의 차이 (원가법이면 사용 안 함)'),
  ('1210', '미수금',             'asset',     'debit',  false, 30,  '받을 돈 (미수 이자·처분대금 등)'),
  ('2010', '미지급관리보수',     'liability', 'credit', false, 110, '청구했지만 아직 지급하지 않은 관리보수'),
  ('2020', '미지급비용',         'liability', 'credit', false, 120, '발생했지만 아직 지급하지 않은 비용'),
  ('2030', '미지급분배금',       'liability', 'credit', false, 130, '확정했지만 아직 지급하지 않은 분배금'),
  ('3010', '출자금',             'equity',    'credit', false, 210, '조합원이 납입한 출자금'),
  ('3020', '분배금',             'equity',    'debit',  true,  220, '조합원에게 지급한 분배금 (자본 차감)'),
  ('3100', '이익잉여금',         'equity',    'credit', false, 230, '결산으로 대체된 누적 손익'),
  ('4010', '투자자산처분이익',   'revenue',   'credit', false, 310, '처분대가 − 처분 원가 (이익)'),
  ('4020', '투자자산평가이익',   'revenue',   'credit', false, 320, '공정가치 평가 이익 (평가 분개 시)'),
  ('4030', '이자·배당수익',      'revenue',   'credit', false, 330, '예금 이자, 투자 기업 배당·이자'),
  ('5010', '관리보수',           'expense',   'debit',  false, 410, '운용사(GP)에 지급하는 관리보수'),
  ('5020', '투자자산처분손실',   'expense',   'debit',  false, 420, '처분대가 − 처분 원가 (손실)'),
  ('5030', '투자자산평가손실',   'expense',   'debit',  false, 430, '공정가치 평가 손실 (평가 분개 시)'),
  ('5110', '회계감사수수료',     'expense',   'debit',  false, 510, null),
  ('5120', '수탁보수',           'expense',   'debit',  false, 520, null),
  ('5130', '사무관리보수',       'expense',   'debit',  false, 530, null),
  ('5140', '설립비',             'expense',   'debit',  false, 540, null),
  ('5150', '지급수수료',         'expense',   'debit',  false, 550, '법률·자문 등'),
  ('5160', '세금과공과',         'expense',   'debit',  false, 560, null),
  ('5190', '기타비용',           'expense',   'debit',  false, 590, null);


-- 2. 분개장 -------------------------------------------------------------------

create table journal_entries (
  id             uuid primary key default gen_random_uuid(),
  fund_id        uuid not null references funds(id),
  entry_no       integer not null check (entry_no > 0),   -- 조합 안에서 1, 2, 3…
  entry_date     date not null,                          -- 회계 처리일 (거래일)
  description    text not null,
  source_type    text not null check (source_type in (
                   'contribution', 'distribution', 'investment', 'exit', 'management_fee', 'expense', 'manual', 'closing')),
  source_id      uuid,                                   -- 원인 업무 기록 (수동·결산 분개는 비움)
  reversal_of_id uuid unique references journal_entries(id),  -- 역분개 대상 (한 번만)
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),

  unique (fund_id, entry_no)
);
create index on journal_entries (fund_id, entry_date);
-- 업무 기록 하나에 자동 분개는 하나 (역분개 제외). 소급 분개를 두 번 돌려도 중복되지 않는다
create unique index journal_entries_one_per_source on journal_entries (source_type, source_id)
  where source_id is not null and reversal_of_id is null;
comment on table journal_entries is '분개장 (추가만 가능, 정정은 역분개)';

create table journal_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references journal_entries(id),
  line_no      integer not null check (line_no > 0),
  account_code text not null references accounts(code),
  debit        bigint not null default 0 check (debit >= 0),
  credit       bigint not null default 0 check (credit >= 0),
  memo         text,

  unique (entry_id, line_no),
  constraint one_side check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))  -- 한 줄은 차변 또는 대변 하나
);
create index on journal_lines (account_code);
comment on table journal_lines is '분개 줄 (차변·대변)';

-- 분개장은 추가만 가능하다
create trigger journal_entries_no_update before update or delete on journal_entries
  for each row execute function forbid_modification();
create trigger journal_lines_no_update before update or delete on journal_lines
  for each row execute function forbid_modification();

-- 대차 일치: 트랜잭션이 끝날 때 분개마다 차변 합 = 대변 합이고 줄이 2개 이상인지 검사한다
create function check_journal_balanced() returns trigger
language plpgsql as $$
declare d bigint; c bigint; n integer;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) into d, c, n
  from journal_lines where entry_id = new.entry_id;
  if n < 2 or d <> c then
    raise exception '분개의 차변 합(%)과 대변 합(%)이 다르거나 줄이 부족합니다 (분개 %)', d, c, new.entry_id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger journal_lines_balanced after insert on journal_lines
  deferrable initially deferred
  for each row execute function check_journal_balanced();


-- 3. 결산 ---------------------------------------------------------------------

create table fiscal_closings (
  id               uuid primary key default gen_random_uuid(),
  fund_id          uuid not null references funds(id),
  fiscal_year      integer not null,
  period_start     date not null,
  period_end       date not null,                     -- 이 날짜까지 잠긴다
  closing_entry_id uuid references journal_entries(id),  -- 손익 대체 분개 (손익이 0이면 없음)
  net_income       bigint not null,
  closed_by        uuid references users(id),
  closed_at        timestamptz not null default now(),

  unique (fund_id, fiscal_year),
  constraint period_order check (period_end >= period_start)
);
comment on table fiscal_closings is '사업연도 결산 (결산한 기간은 분개 잠금)';

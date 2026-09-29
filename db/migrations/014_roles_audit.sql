-- =============================================================================
-- 014_roles_audit.sql — 역할별 권한 · 감사 로그 (D42)
-- =============================================================================
--   users.role   admin(관리자) / manager(운용) / finance(재무) / viewer(조회)
--                어떤 역할이 어떤 작업을 할 수 있는지는 lib/auth/permissions.ts 한곳에서 정한다
--   audit_logs   누가 언제 무엇을 했는지 (모든 쓰기 요청 · 로그인 · LP 시스템 · 주기 작업). 추가만 가능
-- =============================================================================

-- 1. 역할 ----------------------------------------------------------------------

alter table users add column role text not null default 'manager'
  check (role in ('admin', 'manager', 'finance', 'viewer'));
comment on column users.role is '시스템 역할: admin(관리자) / manager(운용) / finance(재무) / viewer(조회)';

-- 데모 버튼 계정은 모든 화면을 둘러볼 수 있게 관리자 (나머지 데모 구성원은 seed-staff 가 직위에 맞게 정한다)
update users set role = 'admin' where email = 'demo@vc-erp.dev';


-- 2. 감사 로그 ------------------------------------------------------------------

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type  text not null check (actor_type in ('user', 'lp_system', 'cron')),
  user_id     uuid references users(id),           -- GP 사용자 (로그인 실패는 비어 있을 수 있다)
  user_name   text,                                -- 기록 당시 이름·역할 (나중에 바뀌어도 그대로)
  user_role   text,
  method      text not null,                       -- POST / PUT / PATCH / DELETE
  path        text not null,                       -- 실제 주소
  action      text not null,                       -- ID를 뺀 주소 모양 (예: POST /funds/:id/exits/:id/cancel)
  fund_id     uuid,                                -- 주소에서 읽은 조합 (조합별로 찾아보기)
  status      integer not null,                    -- 응답 코드 (2xx 성공, 403 권한 없음 …)
  error_code  text,                                -- 실패했을 때 오류 코드
  detail      jsonb,                               -- 로그인 시도 이메일, LP id 같은 부가 정보 (요청 본문은 저장하지 않는다)
  ip          text,
  user_agent  text
);
create index on audit_logs (occurred_at desc);
create index on audit_logs (user_id, occurred_at desc);
create index on audit_logs (fund_id, occurred_at desc);
comment on table audit_logs is '감사 로그 (추가만 가능)';

create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function forbid_modification();

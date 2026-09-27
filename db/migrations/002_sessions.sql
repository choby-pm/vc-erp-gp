-- =============================================================================
-- 002_sessions.sql — 로그인 세션 (D27)
-- =============================================================================
-- 로그인할 때마다 세션을 한 행 저장하고, 브라우저 쿠키에는 무작위 토큰만 넣는다.
--
-- · DB에는 토큰 원문이 아니라 SHA-256 지문(token_hash)만 저장한다.
--   DB 내용이 유출되어도 지문만으로는 쿠키를 만들어낼 수 없다.
-- · 로그아웃·강제 로그아웃은 revoked_at 을 채워서 처리한다. 행은 지우지 않아 접속 기록이 남는다.
-- · LP 공개 등급: 🔴 비공개
-- =============================================================================

create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint expires_after_created check (expires_at > created_at)
);
create index on sessions (user_id);
comment on table sessions is 'GP 사용자 로그인 세션';

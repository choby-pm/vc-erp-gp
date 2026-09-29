-- =============================================================================
-- 013_jobs_attachments.sql — 주기 작업 잠금 · 파일 첨부 (D41)
-- =============================================================================
--   scheduled_jobs  주기 작업(Vercel Cron)과 수동 실행이 겹치지 않게 하는 잠금 + 마지막 실행 기록
--   attachments     규약 원문·보고서 PDF. 파일 자체는 Vercel Blob(비공개)에, 여기는 메타데이터만 둔다
-- =============================================================================

-- 1. 주기 작업 ------------------------------------------------------------------

-- 잠금은 "locked_until 까지 이 작업을 한 곳에서만 실행"하는 임대(lease) 방식이다.
-- 커넥션 풀러를 거치므로 세션 단위 advisory lock 대신 행 하나로 잠근다. 실행이 죽어도 시간이 지나면 풀린다
create table scheduled_jobs (
  name             text primary key,               -- 예: dispatch_events
  locked_until     timestamptz not null default now(),
  last_trigger     text check (last_trigger in ('cron', 'manual')),
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_result      jsonb,
  last_error       text
);
comment on table scheduled_jobs is '주기 작업 잠금·마지막 실행';


-- 2. 파일 첨부 ------------------------------------------------------------------

create table attachments (
  id            uuid primary key default gen_random_uuid(),
  fund_id       uuid not null references funds(id),
  target_type   text not null check (target_type in ('fund_terms', 'report')),  -- 규약 버전 / 정기 보고
  target_id     uuid not null,
  file_name     text not null,                    -- 올린 파일 이름 (내려받을 때 이 이름으로)
  content_type  text not null,
  size_bytes    integer not null check (size_bytes > 0),
  blob_pathname text not null unique,             -- Blob 경로 (비공개 스토어, 주소를 화면에 노출하지 않는다)
  uploaded_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,                      -- 지우면 목록·LP에서 빠지고 기록은 남는다
  deleted_by    uuid references users(id),

  constraint delete_has_actor check ((deleted_at is null) = (deleted_by is null))
);
create index on attachments (target_type, target_id) where deleted_at is null;
comment on table attachments is '파일 첨부 (규약 원문·보고서 PDF, 파일은 Vercel Blob)';

import { createHmac } from "node:crypto";
import { after } from "next/server";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { jobStatus, runExclusive, type JobTrigger } from "@/lib/services/jobs";

// LP 시스템 연동 이벤트 전송 (아웃박스 → 웹훅, D12, 05 API 설계 6장, BR-EVT-03, 04)
// · 전송 주소(LP_SYSTEM_WEBHOOK_URL)가 없으면 보내지 않고 대기(pending)로 둔다. LP 시스템은 /api/lp/v1/events 로 직접 가져갈 수도 있다
// · 서명: X-GP-Signature = sha256=HMAC(LP_WEBHOOK_SECRET, 타임스탬프 + "." + 본문)
// · 실패하면 1분 → 5분 → 30분 → 2시간 → 12시간 뒤 다시 보낸다. 5번 실패하면 failed 로 멈춘다 (GP가 재전송)
// · 같은 LP에게 가는 이벤트는 순서대로: 앞 이벤트가 전송되지 않았으면 뒤 이벤트는 기다린다
// · 바로 보내기 (D46): 이벤트를 만든 요청이 응답을 보낸 뒤 after() 로 전송을 시작한다 (dispatchSoon)
// · 주기 작업 (D41): Vercel Cron 이 /api/cron/dispatch-events 를 부른다 (무료 요금제라 하루 1회, vercel.ts). 바로 보내기에서 실패한 것을 다시 보낸다
//   바로 보내기·수동 전송과 겹치지 않게 같은 잠금(dispatch_events)을 쓴다

export type EventStatus = "pending" | "delivered" | "failed";
export type IntegrationEvent = {
  id: string;
  event_type: string;
  lp_id: string | null;
  lp_name: string | null;
  fund_name: string | null;
  status: EventStatus;
  attempts: number;
  last_error: string | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

export const DISPATCH_JOB = "dispatch_events";
export const DISPATCH_SCHEDULE_LABEL = "매일 오전 9시 (무료 요금제: 하루 1회)"; // vercel.ts 의 crons 와 맞춘다

export function integrationConfig() {
  return {
    api_key_configured: Boolean(process.env.LP_SYSTEM_API_KEY),
    webhook_configured: Boolean(process.env.LP_SYSTEM_WEBHOOK_URL),
    secret_configured: Boolean(process.env.LP_WEBHOOK_SECRET),
    cron_configured: Boolean(process.env.CRON_SECRET),
  };
}

// 잠금을 잡고 전송한다. 이미 다른 곳(Cron·다른 요청)이 보내는 중이면 건너뛴다.
// 건너뛴 쪽의 이벤트를 놓치지 않게, 잠금을 가진 쪽은 새로 보낼 것이 없을 때까지 몇 번 더 돈다
export async function dispatchEventsExclusive(trigger: JobTrigger) {
  const run = await runExclusive(DISPATCH_JOB, trigger, 300, async () => {
    const total = await dispatchEvents();
    for (let round = 1; round < 5 && total.configured && total.attempted > 0; round++) {
      const next = await dispatchEvents();
      if (next.attempted === 0) break;
      total.attempted += next.attempted;
      total.delivered += next.delivered;
      total.failed += next.failed;
      total.waiting = next.waiting;
    }
    return total;
  });
  return run.ran ? { ...run.result, skipped: false } : { configured: true, attempted: 0, delivered: 0, failed: 0, waiting: 0, skipped: true };
}

// 이벤트를 만든 요청이 끝나면 바로 보낸다 (D46). 요청 밖(데이터 넣기 스크립트 등)에서는 after() 를 쓸 수 없어 건너뛰고 주기 작업에 맡긴다
export function dispatchSoon() {
  if (!process.env.LP_SYSTEM_WEBHOOK_URL || !process.env.LP_WEBHOOK_SECRET) return;
  try {
    after(() => dispatchEventsExclusive("auto").catch((err) => console.error("[dispatchSoon]", err)));
  } catch {
    // 요청 범위 밖
  }
}

export async function listEvents(status?: EventStatus | null, limit = 100) {
  const events = await sql<IntegrationEvent[]>`
    select e.id, e.event_type, e.lp_id, lp.name as lp_name, f.name as fund_name, e.status, e.attempts, e.last_error, e.delivered_at, e.created_at, e.updated_at
    from integration_events e
    left join limited_partners lp on lp.id = e.lp_id
    left join funds f on f.id::text = e.payload->>'fund_id'
    where (${status ?? null}::text is null or e.status = ${status ?? null})
    order by e.created_at desc, e.id desc
    limit ${limit}
  `;
  const [counts] = await sql<{ pending: number; delivered: number; failed: number }[]>`
    select count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where status = 'delivered')::int as delivered,
           count(*) filter (where status = 'failed')::int as failed
    from integration_events
  `;
  return { config: integrationConfig(), counts, events, job: await jobStatus(DISPATCH_JOB) };
}

// 실패 이벤트 재전송: 다시 대기로 돌리고 시도 횟수를 0으로 (BR-EVT-03)
export async function retryEvent(eventId: string) {
  assertUuid(eventId, "이벤트를");
  const [e] = await sql<{ status: EventStatus }[]>`select status from integration_events where id = ${eventId}`;
  if (!e) throw notFound("이벤트를");
  if (e.status !== "failed") throw new AppError(409, "INVALID_STATE", "전송에 실패한 이벤트만 다시 보낼 수 있습니다", "BR-EVT-03");
  await sql`update integration_events set status = 'pending', attempts = 0, last_error = null, updated_at = now() where id = ${eventId}`;
}

export function signWebhook(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// 대기 중인 이벤트를 순서대로 보낸다. 한 번 부를 때 최대 limit 건
export async function dispatchEvents(limit = 100) {
  const url = process.env.LP_SYSTEM_WEBHOOK_URL;
  const secret = process.env.LP_WEBHOOK_SECRET;
  if (!url || !secret) return { configured: false, attempted: 0, delivered: 0, failed: 0, waiting: 0 };

  const pending = await sql<{ id: string; event_type: string; lp_id: string | null; payload: Record<string, unknown>; attempts: number; created_at: Date; updated_at: Date }[]>`
    select id, event_type, lp_id, payload, attempts, created_at, updated_at from integration_events
    where status in ('pending', 'failed')
    order by created_at, id
    limit ${limit * 5}
  `;
  const blocked = new Set<string>(); // 앞 이벤트가 아직 안 간 LP (순서 보장, BR-EVT-04)
  const result = { configured: true, attempted: 0, delivered: 0, failed: 0, waiting: 0 };
  for (const e of pending) {
    const key = e.lp_id ?? "*";
    if (blocked.has(key)) {
      result.waiting++;
      continue;
    }
    if (e.attempts >= MAX_ATTEMPTS) {
      blocked.add(key); // 멈춘 이벤트 뒤는 GP가 재전송할 때까지 기다린다
      continue;
    }
    if (e.attempts > 0 && Date.now() - new Date(e.updated_at).getTime() < BACKOFF_MS[e.attempts - 1]) {
      blocked.add(key);
      result.waiting++;
      continue;
    }
    if (result.attempted >= limit) break;
    result.attempted++;

    const { fund_id, ...data } = e.payload as { fund_id?: string };
    const body = JSON.stringify({ id: e.id, event_type: e.event_type, occurred_at: e.created_at, lp_id: e.lp_id, fund_id: fund_id ?? null, data });
    const timestamp = new Date().toISOString();
    let error: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-GP-Event-Id": e.id, "X-GP-Timestamp": timestamp, "X-GP-Signature": signWebhook(secret, timestamp, body) },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (!error) {
      await sql`update integration_events set status = 'delivered', delivered_at = now(), attempts = attempts + 1, last_error = null, updated_at = now() where id = ${e.id}`;
      result.delivered++;
    } else {
      const attempts = e.attempts + 1;
      await sql`
        update integration_events set status = ${attempts >= MAX_ATTEMPTS ? "failed" : "pending"}, attempts = ${attempts}, last_error = ${error.slice(0, 500)}, updated_at = now()
        where id = ${e.id}
      `;
      result.failed++;
      blocked.add(key);
    }
  }
  return result;
}

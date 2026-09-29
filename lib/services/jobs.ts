import { sql } from "@/lib/db";

// 주기 작업 실행 (D41). Vercel Cron과 GP 화면의 수동 실행이 겹쳐 같은 이벤트를 두 번 보내지 않게 잠근다.
// · 잠금은 임대(lease): locked_until 이 지난 경우에만 가져간다. 실행이 중간에 죽어도 그 시간이 지나면 다시 돌 수 있다
// · 마지막 실행 결과를 남겨 LP 연동 화면에서 보여준다

export type JobTrigger = "cron" | "manual";
export type JobStatus = {
  name: string;
  last_trigger: JobTrigger | null;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  last_result: Record<string, unknown> | null;
  last_error: string | null;
  running: boolean;
};

export async function runExclusive<T extends Record<string, unknown>>(name: string, trigger: JobTrigger, leaseSeconds: number, fn: () => Promise<T>) {
  const [claimed] = await sql`
    insert into scheduled_jobs (name, locked_until, last_trigger, last_started_at)
    values (${name}, now() + make_interval(secs => ${leaseSeconds}), ${trigger}, now())
    on conflict (name) do update
      set locked_until = excluded.locked_until, last_trigger = excluded.last_trigger, last_started_at = excluded.last_started_at
      where scheduled_jobs.locked_until <= now()
    returning name
  `;
  if (!claimed) return { ran: false as const };

  try {
    const result = await fn();
    await sql`
      update scheduled_jobs set locked_until = now(), last_finished_at = now(), last_result = ${sql.json(result as never)}, last_error = null
      where name = ${name}
    `;
    return { ran: true as const, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`update scheduled_jobs set locked_until = now(), last_finished_at = now(), last_error = ${message.slice(0, 500)} where name = ${name}`;
    throw err;
  }
}

export async function jobStatus(name: string): Promise<JobStatus | null> {
  const [row] = await sql<(Omit<JobStatus, "running"> & { locked_until: Date })[]>`
    select name, locked_until, last_trigger, last_started_at, last_finished_at, last_result, last_error from scheduled_jobs where name = ${name}
  `;
  if (!row) return null;
  const { locked_until, ...rest } = row;
  return { ...rest, running: new Date(locked_until).getTime() > Date.now() };
}

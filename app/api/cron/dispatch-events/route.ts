import { timingSafeEqual } from "node:crypto";
import { toErrorResponse } from "@/lib/api/handler";
import { fail, ok } from "@/lib/api/response";
import { writeAudit } from "@/lib/services/audit";
import { dispatchEventsExclusive } from "@/lib/services/integration";

// GET /api/cron/dispatch-events — Vercel Cron 이 부르는 이벤트 전송 주기 작업 (D41, 일정은 vercel.ts)
// Vercel 은 CRON_SECRET 이 설정되어 있으면 Authorization: Bearer {CRON_SECRET} 을 붙여 부른다. 그 밖의 호출은 거부한다

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const given = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return fail(503, "CRON_DISABLED", "CRON_SECRET 이 설정되지 않았습니다");
  if (!authorized(request.headers.get("authorization"))) return fail(401, "UNAUTHORIZED", "주기 작업 인증 값이 올바르지 않습니다");
  let res: Response;
  try {
    const result = await dispatchEventsExclusive("cron");
    res = ok(result);
    await writeAudit({ actor_type: "cron", method: "GET", path: "/api/cron/dispatch-events", status: 200, detail: result, request });
  } catch (err) {
    res = toErrorResponse(err);
    await writeAudit({ actor_type: "cron", method: "GET", path: "/api/cron/dispatch-events", status: res.status, request });
  }
  return res;
}

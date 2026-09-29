import { rejectUnlessCron } from "@/lib/api/cron";
import { toErrorResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { writeAudit } from "@/lib/services/audit";
import { dispatchEventsExclusive } from "@/lib/services/integration";

// GET /api/cron/dispatch-events — Vercel Cron 이 부르는 이벤트 전송 주기 작업 (D41, 일정은 vercel.ts)
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
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

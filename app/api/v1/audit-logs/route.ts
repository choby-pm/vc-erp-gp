import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { listAuditLogs, type AuditFilter } from "@/lib/services/audit";

// GET /api/v1/audit-logs?user_id=&fund_id=&result=ok|fail|denied&from=&to= — 감사 로그 (관리자만, 최근 200건, BR-AUTH-04)
export const GET = withUser<RouteContext<"/api/v1/audit-logs">>(async (request) => {
  const q = new URL(request.url).searchParams;
  const result = q.get("result");
  const filter: AuditFilter = {
    user_id: q.get("user_id"),
    fund_id: q.get("fund_id"),
    result: result === "ok" || result === "fail" || result === "denied" ? result : null,
    from: q.get("from"),
    to: q.get("to"),
  };
  return ok(await listAuditLogs(filter));
});

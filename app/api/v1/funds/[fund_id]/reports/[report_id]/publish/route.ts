import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getReport, publishReport } from "@/lib/services/reports";

// POST /api/v1/funds/{fund_id}/reports/{report_id}/publish — 발행 (스냅샷 저장·잠금 + LP 통지 + 이벤트, BR-RPT-03, 05)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/reports/[report_id]/publish">>(async (_request, ctx, user) => {
  const { fund_id, report_id } = await ctx.params;
  await publishReport(fund_id, report_id, user.id);
  return ok(await getReport(fund_id, report_id));
});

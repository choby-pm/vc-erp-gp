import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpReports } from "@/lib/services/lp-portal";

// GET …/reports — 발행된 정기 보고 스냅샷 (🔵🟡)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/reports">>(async (_request, ctx) => {
  const { lp_id, fund_id } = await ctx.params;
  return ok(await lpReports(lp_id, fund_id));
});

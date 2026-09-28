import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpFund } from "@/lib/services/lp-portal";

// GET /api/lp/v1/lps/{lp_id}/funds/{fund_id} — 조합 정보 + 현재 규약 + 관계 기관 + 운용 인력 + 내 현황 (🔵🟢, 조합원이 아니면 403)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]">>(async (_request, ctx) => {
  const { lp_id, fund_id } = await ctx.params;
  return ok(await lpFund(lp_id, fund_id));
});

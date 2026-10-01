import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpProposals } from "@/lib/services/lp-portal";

// GET /api/lp/v1/lps/{lp_id}/proposals — 내 출자 제안 + 제안 검토에 필요한 조합 정보 (🟢, D45)
// 조합원이 되기 전에도 조회된다. 발송한 제안만
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/proposals">>(async (_request, ctx) => {
  const { lp_id } = await ctx.params;
  return ok(await lpProposals(lp_id));
});

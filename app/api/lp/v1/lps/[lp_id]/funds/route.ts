import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpFunds } from "@/lib/services/lp-portal";

// GET /api/lp/v1/lps/{lp_id}/funds — 참여 조합 목록 + 조합별 내 약정·납입·분배 (🔵🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds">>(async (_request, ctx) => {
  const { lp_id } = await ctx.params;
  return ok(await lpFunds(lp_id));
});

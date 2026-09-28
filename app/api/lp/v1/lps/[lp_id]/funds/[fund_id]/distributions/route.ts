import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpDistributions } from "@/lib/services/lp-portal";

// GET …/distributions — 확정된 분배 + 내 분배액(단계별) (🔵🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/distributions">>(async (_request, ctx) => {
  const { lp_id, fund_id } = await ctx.params;
  return ok(await lpDistributions(lp_id, fund_id));
});

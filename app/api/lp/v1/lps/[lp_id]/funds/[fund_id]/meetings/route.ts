import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpMeetings } from "@/lib/services/lp-portal";

// GET …/meetings — 소집된 총회, 안건, 결과, 내 투표 (🔵🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/meetings">>(async (_request, ctx) => {
  const { lp_id, fund_id } = await ctx.params;
  return ok(await lpMeetings(lp_id, fund_id));
});

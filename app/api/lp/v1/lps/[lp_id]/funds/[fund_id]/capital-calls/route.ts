import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpCapitalCalls } from "@/lib/services/lp-portal";

// GET …/capital-calls — 발송된 캐피탈콜 + 내 요청액·납입 상태 (🔵🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/capital-calls">>(async (_request, ctx) => {
  const { lp_id, fund_id } = await ctx.params;
  return ok(await lpCapitalCalls(lp_id, fund_id));
});

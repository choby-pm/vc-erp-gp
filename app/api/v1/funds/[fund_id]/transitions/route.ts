import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { fundTransitionSchema } from "@/lib/schemas/proposal";
import { getFund } from "@/lib/services/funds";
import { transitionFund } from "@/lib/services/fund-transitions";

// POST /api/v1/funds/{fund_id}/transitions — 상태 이동 { to_status } (지금은 기획 → 모집만, BR-FUND-01, 06)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/transitions">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const { to_status } = await parseBody(request, fundTransitionSchema);
  await transitionFund(fund_id, to_status);
  return ok(await getFund(fund_id));
});

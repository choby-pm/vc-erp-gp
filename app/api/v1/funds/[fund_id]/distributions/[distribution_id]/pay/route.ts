import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getDistribution, payDistribution } from "@/lib/services/distributions";

// POST /api/v1/funds/{fund_id}/distributions/{distribution_id}/pay — 지급 (조합원 원장 + 분개, Idempotency-Key 필수, BR-DIST-06)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/distributions/[distribution_id]/pay">>(async (request, ctx, user) => {
  const { fund_id, distribution_id } = await ctx.params;
  return idempotent(request, user.id, async () => {
    await payDistribution(fund_id, distribution_id, user.id);
    return ok(await getDistribution(fund_id, distribution_id));
  });
});

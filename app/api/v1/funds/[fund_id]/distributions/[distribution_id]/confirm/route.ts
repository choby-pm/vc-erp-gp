import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { confirmDistribution, getDistribution } from "@/lib/services/distributions";

// POST /api/v1/funds/{fund_id}/distributions/{distribution_id}/confirm — 확정 (잠금 + LP별 분배 통지, Idempotency-Key 필수, BR-DIST-05)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/distributions/[distribution_id]/confirm">>(async (request, ctx, user) => {
  const { fund_id, distribution_id } = await ctx.params;
  return idempotent(request, user.id, async () => {
    await confirmDistribution(fund_id, distribution_id, user.id);
    return ok(await getDistribution(fund_id, distribution_id));
  });
});

import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { cancelDistribution, getDistribution } from "@/lib/services/distributions";

// POST /api/v1/funds/{fund_id}/distributions/{distribution_id}/cancel — 확정·지급한 분배 취소 { reason }
// (지급했으면 원장 취소 행 + 분개 역분개, LP 취소 통지, BR-DIST-12)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/distributions/[distribution_id]/cancel">>(async (request, ctx, user) => {
  const { fund_id, distribution_id } = await ctx.params;
  const { reason } = await parseBody(request, z.object({ reason: z.string({ error: "취소 사유를 입력하세요" }).trim().min(1, "취소 사유를 입력하세요").max(500) }));
  await cancelDistribution(fund_id, distribution_id, reason, user.id);
  return ok(await getDistribution(fund_id, distribution_id));
});

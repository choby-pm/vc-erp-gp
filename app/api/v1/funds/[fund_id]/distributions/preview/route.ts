import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { distributionSchema } from "@/lib/schemas/distribution";
import { previewDistribution } from "@/lib/services/distributions";

// POST /api/v1/funds/{fund_id}/distributions/preview — 워터폴 계산 미리보기 (저장하지 않음, 05 API 설계 4-5)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/distributions/preview">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await previewDistribution(fund_id, await parseBody(request, distributionSchema)));
});

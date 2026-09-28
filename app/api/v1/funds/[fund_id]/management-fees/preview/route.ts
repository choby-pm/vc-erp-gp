import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { feePeriodSchema } from "@/lib/schemas/management-fee";
import { previewManagementFee } from "@/lib/services/management-fees";

// POST /api/v1/funds/{fund_id}/management-fees/preview — 분기를 넣으면 구간 분할·계산 결과 (저장하지 않음, BR-FEE-02~07)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/management-fees/preview">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const { year, quarter } = await parseBody(request, feePeriodSchema);
  return ok(await previewManagementFee(fund_id, year, quarter));
});

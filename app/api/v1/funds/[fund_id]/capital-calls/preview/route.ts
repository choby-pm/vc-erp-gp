import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { capitalCallSchema } from "@/lib/schemas/capital-call";
import { previewCapitalCall } from "@/lib/services/capital-calls";

// POST /api/v1/funds/{fund_id}/capital-calls/preview — 조합원별 배분 미리보기 (저장하지 않음, BR-CALL-02~05)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/capital-calls/preview">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await previewCapitalCall(fund_id, await parseBody(request, capitalCallSchema)));
});

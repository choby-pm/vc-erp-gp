import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { registrationSchema } from "@/lib/schemas/institution";
import { getFund } from "@/lib/services/funds";
import { updateRegistration } from "@/lib/services/institutions";

// PUT /api/v1/funds/{fund_id}/registration — 등록 신청일·완료일 입력 (결성 후 운용 시작 전까지, BR-FUND-03)
export const PUT = withUser<RouteContext<"/api/v1/funds/[fund_id]/registration">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  await updateRegistration(fund_id, await parseBody(request, registrationSchema));
  return ok(await getFund(fund_id));
});

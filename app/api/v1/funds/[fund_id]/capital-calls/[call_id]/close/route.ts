import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { closeCapitalCall, getCapitalCall } from "@/lib/services/capital-calls";

// POST /api/v1/funds/{fund_id}/capital-calls/{call_id}/close — 수동 마감 (미납이 남아도 가능, 마감 후에도 납입 기록 가능, BR-CALL-12)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/capital-calls/[call_id]/close">>(async (_request, ctx) => {
  const { fund_id, call_id } = await ctx.params;
  await closeCapitalCall(fund_id, call_id);
  return ok(await getCapitalCall(fund_id, call_id));
});

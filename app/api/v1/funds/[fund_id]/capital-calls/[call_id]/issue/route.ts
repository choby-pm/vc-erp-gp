import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getCapitalCall, issueCapitalCall } from "@/lib/services/capital-calls";

// POST /api/v1/funds/{fund_id}/capital-calls/{call_id}/issue — 발송 (잠금 + LP별 통지, Idempotency-Key 필수, BR-CALL-07)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/capital-calls/[call_id]/issue">>(async (request, ctx, user) => {
  const { fund_id, call_id } = await ctx.params;
  return idempotent(request, user.id, async () => {
    await issueCapitalCall(fund_id, call_id, user.id);
    return ok(await getCapitalCall(fund_id, call_id));
  });
});

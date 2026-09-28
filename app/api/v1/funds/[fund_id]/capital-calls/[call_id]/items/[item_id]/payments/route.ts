import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { paymentSchema } from "@/lib/schemas/capital-call";
import { getCapitalCall, recordPayment } from "@/lib/services/capital-calls";

// POST /api/v1/funds/{fund_id}/capital-calls/{call_id}/items/{item_id}/payments — 납입 기록
// (원장 contribution + 이벤트, 완납 시 자동 마감, Idempotency-Key 필수, BR-CALL-08~10, 12)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/capital-calls/[call_id]/items/[item_id]/payments">>(
  async (request, ctx, user) => {
    const { fund_id, call_id, item_id } = await ctx.params;
    return idempotent(request, user.id, async (body) => {
      const { ledger_entry_id } = await recordPayment(fund_id, call_id, item_id, validateBody(body, paymentSchema), user.id);
      return ok({ ledger_entry_id, capital_call: await getCapitalCall(fund_id, call_id) }, 201);
    });
  },
);

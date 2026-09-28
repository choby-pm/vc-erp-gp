import { z } from "zod";
import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { reverseLedgerEntry } from "@/lib/services/ledger";

const reversalSchema = z.object({
  memo: z.string({ error: "취소 사유를 입력하세요" }).trim().min(1, "취소 사유를 입력하세요").max(500, "500자 이하로 입력하세요"),
});

// POST /api/v1/funds/{fund_id}/ledger/{entry_id}/reversal — 원장 행 취소 { memo } (납입만, Idempotency-Key 필수, BR-LED-02)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/ledger/[entry_id]/reversal">>(async (request, ctx, user) => {
  const { fund_id, entry_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => {
    const { memo } = validateBody(body, reversalSchema);
    return ok({ reversal_entry_id: await reverseLedgerEntry(fund_id, entry_id, memo, user.id) }, 201);
  });
});

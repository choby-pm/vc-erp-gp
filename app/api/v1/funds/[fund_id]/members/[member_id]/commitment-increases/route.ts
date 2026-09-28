import { z } from "zod";
import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { getRoster, increaseCommitment } from "@/lib/services/roster";

const schema = z.object({
  agenda_id: z.uuid("근거 안건을 선택하세요"),
  amount: z.number({ error: "증액할 금액을 입력하세요" }).int("원 단위 정수로 입력하세요").positive("0보다 커야 합니다").max(Number.MAX_SAFE_INTEGER),
  entry_date: z.string({ error: "증액일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "증액일은 YYYY-MM-DD 형식입니다"),
});

// POST /api/v1/funds/{fund_id}/members/{member_id}/commitment-increases — 약정 증액 (가결 안건 필수, Idempotency-Key 필수, BR-MEM-06)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/members/[member_id]/commitment-increases">>(async (request, ctx, user) => {
  const { fund_id, member_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => {
    const entryId = await increaseCommitment(fund_id, member_id, validateBody(body, schema), user.id);
    return ok({ ledger_entry_id: entryId, roster: await getRoster(fund_id) }, 201);
  });
});

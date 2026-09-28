import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { cancelExpense, listExpenses } from "@/lib/services/finance";

// POST /api/v1/funds/{fund_id}/expenses/{expense_id}/cancel — 기타 비용 취소 { reason } (지우지 않고 취소 표시, BR-EXP-02)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/expenses/[expense_id]/cancel">>(async (request, ctx, user) => {
  const { fund_id, expense_id } = await ctx.params;
  const { reason } = await parseBody(request, z.object({ reason: z.string({ error: "취소 사유를 입력하세요" }).trim().min(1, "취소 사유를 입력하세요").max(500) }));
  await cancelExpense(fund_id, expense_id, reason, user.id);
  return ok(await listExpenses(fund_id));
});

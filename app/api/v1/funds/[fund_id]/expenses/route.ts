import { z } from "zod";
import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { EXPENSE_TYPES } from "@/lib/labels";
import { createExpense, listExpenses } from "@/lib/services/finance";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/expenses">;

const schema = z.object({
  expense_type: z.enum(EXPENSE_TYPES, { error: "비용 종류를 선택하세요" }),
  description: z.string({ error: "내용을 입력하세요" }).trim().min(1, "내용을 입력하세요").max(200, "200자 이하로 입력하세요"),
  payee: z.string().trim().max(100).nullish().transform((v) => (v ? v : null)),
  amount: z.number({ error: "금액을 입력하세요" }).int("원 단위 정수로 입력하세요").positive("0보다 커야 합니다").max(Number.MAX_SAFE_INTEGER),
  paid_date: z.string({ error: "지급일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "지급일은 YYYY-MM-DD 형식입니다"),
});

// GET /api/v1/funds/{fund_id}/expenses — 기타 비용 목록 (취소 포함)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listExpenses(fund_id));
});

// POST /api/v1/funds/{fund_id}/expenses — 기타 비용 기록 (현금 확인, Idempotency-Key 필수, BR-EXP-01)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => {
    const created = await createExpense(fund_id, validateBody(body, schema), user.id);
    return ok({ id: created.id, expenses: await listExpenses(fund_id) }, 201);
  });
});

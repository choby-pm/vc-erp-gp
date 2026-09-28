import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { investmentSchema } from "@/lib/schemas/investment";
import { executeInvestment, getInvestmentSummary, listInvestments } from "@/lib/services/investments";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/investments">;

// GET /api/v1/funds/{fund_id}/investments — 투자 집행 목록 + 투자 가능 잔액·현금·주목적 비율 경고
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  const [summary, investments] = await Promise.all([getInvestmentSummary(fund_id), listInvestments(fund_id)]);
  return ok({ summary, investments });
});

// POST /api/v1/funds/{fund_id}/investments — 투자 집행 (신규·후속, Idempotency-Key 필수, BR-INV-01~06)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => ok(await executeInvestment(fund_id, validateBody(body, investmentSchema), user.id), 201));
});

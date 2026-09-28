import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { validateBody, withUser } from "@/lib/api/handler";
import { chargeFeeSchema } from "@/lib/schemas/management-fee";
import { chargeManagementFee, listManagementFees } from "@/lib/services/management-fees";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/management-fees">;

// GET /api/v1/funds/{fund_id}/management-fees — 청구 이력 + 누적 관리보수 + 현금 잔액
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listManagementFees(fund_id));
});

// POST /api/v1/funds/{fund_id}/management-fees — 분기 청구 저장 (미리보기와 같은 계산, Idempotency-Key 필수, BR-FEE-01~07)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return idempotent(request, user.id, async (body) => {
    const { year, quarter, charged_date } = validateBody(body, chargeFeeSchema);
    const charged = await chargeManagementFee(fund_id, year, quarter, charged_date, user.id);
    return ok({ charged, ...(await listManagementFees(fund_id)) }, 201);
  });
});

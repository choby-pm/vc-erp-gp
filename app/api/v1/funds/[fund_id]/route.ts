import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { fundBasicSchema } from "@/lib/schemas/fund";
import { getFund, updateFundBasic } from "@/lib/services/funds";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]">;

// GET /api/v1/funds/{fund_id} — 펀드 상세 + 현재 규약 + 요약 숫자
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await getFund(fund_id));
});

// PATCH /api/v1/funds/{fund_id} — 기본 정보 수정 (기획·모집 중만, BR-FUND-08)
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const fund = await parseBody(request, fundBasicSchema);
  await updateFundBasic(fund_id, fund);
  return ok(await getFund(fund_id));
});

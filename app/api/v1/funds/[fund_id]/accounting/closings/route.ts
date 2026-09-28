import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { closeFiscalYear, listClosings } from "@/lib/services/accounting";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/accounting/closings">;

// GET /api/v1/funds/{fund_id}/accounting/closings — 결산 이력
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listClosings(fund_id));
});

// POST /api/v1/funds/{fund_id}/accounting/closings — 사업연도 결산 { fiscal_year } (손익 대체 분개 + 기간 잠금, BR-ACC-03)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const { fiscal_year } = await parseBody(request, z.object({ fiscal_year: z.number({ error: "사업연도를 선택하세요" }).int().min(2000).max(2100) }));
  return ok(await closeFiscalYear(fund_id, fiscal_year, user.id), 201);
});

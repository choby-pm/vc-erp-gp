import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { valuationSchema } from "@/lib/schemas/valuation";
import { getPortfolio, recordValuation } from "@/lib/services/portfolio";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/valuations">;

// GET /api/v1/funds/{fund_id}/valuations — 평가 목록 (최신순)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok((await getPortfolio(fund_id)).valuations);
});

// POST /api/v1/funds/{fund_id}/valuations — 평가 기록 (투자한 기업·보유 중·기준일 규칙, BR-VAL-01~03)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  await recordValuation(fund_id, await parseBody(request, valuationSchema), user.id);
  return ok(await getPortfolio(fund_id), 201);
});

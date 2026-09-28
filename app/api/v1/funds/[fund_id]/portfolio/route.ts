import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getPortfolio } from "@/lib/services/portfolio";

// GET /api/v1/funds/{fund_id}/portfolio — 포트폴리오 (기업별 투자·회수·남은 원금·평가액·보유 상태) + 합계
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/portfolio">>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await getPortfolio(fund_id));
});

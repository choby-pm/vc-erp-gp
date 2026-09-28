import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getRoster } from "@/lib/services/roster";

// GET /api/v1/funds/{fund_id}/members — 조합원 목록 + 조합원별 현황 (약정·지분율·요청·납입·잔여)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/members">>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  const { members, totals } = await getRoster(fund_id);
  return ok({ members, totals });
});

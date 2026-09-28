import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { trialBalance } from "@/lib/services/accounting";

// GET /api/v1/funds/{fund_id}/accounting/trial-balance?as_of= — 시산표 (계정별 차변·대변 합계와 잔액)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/accounting/trial-balance">>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const asOf = new URL(request.url).searchParams.get("as_of");
  return ok(await trialBalance(fund_id, asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })));
});

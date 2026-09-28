import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { deleteDistribution, getDistribution, listDistributions } from "@/lib/services/distributions";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/distributions/[distribution_id]">;

// GET /api/v1/funds/{fund_id}/distributions/{distribution_id} — 상세 (조합원 × 단계별 분배액)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, distribution_id } = await ctx.params;
  return ok(await getDistribution(fund_id, distribution_id));
});

// DELETE — 초안 삭제 (확정 후에는 잠김, BR-COM-03)
export const DELETE = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, distribution_id } = await ctx.params;
  await deleteDistribution(fund_id, distribution_id);
  return ok(await listDistributions(fund_id));
});

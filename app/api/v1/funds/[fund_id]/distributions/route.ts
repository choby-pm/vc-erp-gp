import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { distributionSchema } from "@/lib/schemas/distribution";
import { createDistribution, getDistribution, listDistributions } from "@/lib/services/distributions";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/distributions">;

// GET /api/v1/funds/{fund_id}/distributions — 분배 이력
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listDistributions(fund_id));
});

// POST /api/v1/funds/{fund_id}/distributions — 초안 생성 (워터폴 계산 결과 저장, BR-DIST-01~04, 08)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const { id } = await createDistribution(fund_id, await parseBody(request, distributionSchema), user.id);
  return ok(await getDistribution(fund_id, id), 201);
});

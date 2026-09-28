import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { appointManagerSchema } from "@/lib/schemas/fund-manager";
import { appointManager, listFundManagers } from "@/lib/services/fund-managers";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/managers">;

// GET /api/v1/funds/{fund_id}/managers — 현재 운용 인력 + 교체 이력
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listFundManagers(fund_id));
});

// POST /api/v1/funds/{fund_id}/managers — 선임 (replaces_id 를 주면 교체, 결성 이후엔 가결 안건 필요, BR-MGR-01~05)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  await appointManager(fund_id, await parseBody(request, appointManagerSchema), user.id);
  return ok(await listFundManagers(fund_id), 201);
});

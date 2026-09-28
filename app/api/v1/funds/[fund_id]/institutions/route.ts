import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { institutionSchema } from "@/lib/schemas/institution";
import { createInstitution, listInstitutions } from "@/lib/services/institutions";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/institutions">;

// GET /api/v1/funds/{fund_id}/institutions — 관계 기관 목록
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listInstitutions(fund_id));
});

// POST /api/v1/funds/{fund_id}/institutions — 관계 기관 등록 (종류별 1곳, BR-INST-01)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  await createInstitution(fund_id, await parseBody(request, institutionSchema), user.id);
  return ok(await listInstitutions(fund_id), 201);
});

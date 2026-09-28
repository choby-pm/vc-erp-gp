import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { newTermsSchema } from "@/lib/schemas/fund";
import { createTermsVersion, listTermsVersions } from "@/lib/services/terms";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/terms">;

// GET /api/v1/funds/{fund_id}/terms — 규약 버전 전체 이력 (근거 안건 포함) + 오늘 적용 중인 버전
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listTermsVersions(fund_id));
});

// POST /api/v1/funds/{fund_id}/terms — 규약 새 버전 (가결된 규약 변경 안건 1건당 1개, 적용일 ≥ 총회일, BR-TERM-02, 03)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  await createTermsVersion(fund_id, await parseBody(request, newTermsSchema), user.id);
  return ok(await listTermsVersions(fund_id), 201);
});

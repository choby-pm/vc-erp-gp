import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { fundTermsSchema } from "@/lib/schemas/fund";
import { getFund, updateTermsV1 } from "@/lib/services/funds";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/terms/1">;

// PUT /api/v1/funds/{fund_id}/terms/1 — 규약 버전 1 저장 (결성 전만, BR-TERM-01)
export const PUT = withUser<Ctx>(async (request, ctx) => {
  const { fund_id } = await ctx.params;
  const terms = await parseBody(request, fundTermsSchema);
  await updateTermsV1(fund_id, terms);
  return ok((await getFund(fund_id)).terms);
});

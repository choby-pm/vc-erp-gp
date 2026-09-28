import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { institutionSchema } from "@/lib/schemas/institution";
import { deleteInstitution, listInstitutions, updateInstitution } from "@/lib/services/institutions";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/institutions/[institution_id]">;

// PATCH /api/v1/funds/{fund_id}/institutions/{institution_id} — 관계 기관 수정
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { fund_id, institution_id } = await ctx.params;
  await updateInstitution(fund_id, institution_id, await parseBody(request, institutionSchema));
  return ok(await listInstitutions(fund_id));
});

// DELETE /api/v1/funds/{fund_id}/institutions/{institution_id} — 관계 기관 삭제
export const DELETE = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, institution_id } = await ctx.params;
  await deleteInstitution(fund_id, institution_id);
  return ok(await listInstitutions(fund_id));
});

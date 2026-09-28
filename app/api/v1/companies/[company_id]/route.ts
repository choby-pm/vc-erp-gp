import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { companySchema } from "@/lib/schemas/deal";
import { getCompany, updateCompany } from "@/lib/services/companies";

type Ctx = RouteContext<"/api/v1/companies/[company_id]">;

// GET /api/v1/companies/{company_id} — 기업 상세 + 딜 이력 + 조합별 투자 현황
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { company_id } = await ctx.params;
  return ok(await getCompany(company_id));
});

// PATCH /api/v1/companies/{company_id} — 기업 정보 수정
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { company_id } = await ctx.params;
  await updateCompany(company_id, await parseBody(request, companySchema));
  return ok(await getCompany(company_id));
});

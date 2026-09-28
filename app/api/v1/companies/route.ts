import { AppError } from "@/lib/api/errors";
import { ok, okList } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { companyListQuerySchema, companySchema } from "@/lib/schemas/deal";
import { createCompany, getCompany, listCompanies } from "@/lib/services/companies";

// GET /api/v1/companies?q=&page=&page_size= — 기업 목록 (이름·사업자등록번호·업종·대표자 검색)
export const GET = withUser(async (request) => {
  const query = companyListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건이 올바르지 않습니다");
  const { items, meta } = await listCompanies(query.data);
  return okList(items, meta);
});

// POST /api/v1/companies — 기업 등록 (사업자등록번호 중복 금지)
export const POST = withUser(async (request, _ctx, user) => {
  const created = await createCompany(await parseBody(request, companySchema), user.id);
  return ok(await getCompany(created.id), 201);
});

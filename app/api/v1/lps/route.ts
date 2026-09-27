import { AppError } from "@/lib/api/errors";
import { ok, okList } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { lpListQuerySchema, lpSchema } from "@/lib/schemas/lp";
import { createLp, getLp, listLps } from "@/lib/services/lps";

// GET /api/v1/lps?q=&lp_type=&page=&page_size= — 출자자 목록
export const GET = withUser(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = lpListQuerySchema.safeParse(params);
  if (!query.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건이 올바르지 않습니다");

  const { items, meta } = await listLps(query.data);
  return okList(items, meta);
});

// POST /api/v1/lps — 출자자 등록
export const POST = withUser(async (request, _ctx, user) => {
  const input = await parseBody(request, lpSchema);
  const created = await createLp(input, user.id);
  return ok(await getLp(created.id), 201);
});

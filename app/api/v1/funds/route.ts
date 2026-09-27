import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { createFundSchema } from "@/lib/schemas/fund";
import { createFund, getFund, listFunds } from "@/lib/services/funds";

// GET /api/v1/funds — 펀드 목록 + 요약 숫자
export const GET = withUser(async () => ok(await listFunds()));

// POST /api/v1/funds — 펀드 생성 (상태 planning, 규약 버전 1 함께 생성)
export const POST = withUser(async (request, _ctx, user) => {
  const { fund, terms } = await parseBody(request, createFundSchema);
  const created = await createFund(fund, terms, user.id);
  return ok(await getFund(created.id), 201);
});

import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { capitalCallSchema } from "@/lib/schemas/capital-call";
import { createCapitalCall, getCapitalCall, listCapitalCalls } from "@/lib/services/capital-calls";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/capital-calls">;

// GET /api/v1/funds/{fund_id}/capital-calls — 목록 + 회차별 납입률
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await listCapitalCalls(fund_id));
});

// POST /api/v1/funds/{fund_id}/capital-calls — 초안 생성 (조합원별 요청액 자동 계산·저장, BR-CALL-01~06)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const call = await createCapitalCall(fund_id, await parseBody(request, capitalCallSchema), user.id);
  return ok(await getCapitalCall(fund_id, call.id), 201);
});

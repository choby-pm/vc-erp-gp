import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { capitalCallSchema } from "@/lib/schemas/capital-call";
import { deleteCapitalCall, getCapitalCall, listCapitalCalls, updateCapitalCall } from "@/lib/services/capital-calls";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/capital-calls/[call_id]">;

// GET /api/v1/funds/{fund_id}/capital-calls/{call_id} — 상세 + 조합원별 납입 상태 (BR-CALL-11)
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, call_id } = await ctx.params;
  return ok(await getCapitalCall(fund_id, call_id));
});

// PATCH — 초안 수정 (다시 계산). 발송 후에는 잠김 (BR-COM-03)
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { fund_id, call_id } = await ctx.params;
  await updateCapitalCall(fund_id, call_id, await parseBody(request, capitalCallSchema));
  return ok(await getCapitalCall(fund_id, call_id));
});

// DELETE — 초안 삭제
export const DELETE = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id, call_id } = await ctx.params;
  await deleteCapitalCall(fund_id, call_id);
  return ok(await listCapitalCalls(fund_id));
});

import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { applicableFunds, getLpCall, listMyApplications } from "@/lib/services/lp-calls";

// GET /api/v1/lp-calls/{program_id} — 공고 하나 + 지원할 수 있는 조합 + 이 공고에 지원한 내역 (D47)
export const GET = withUser<RouteContext<"/api/v1/lp-calls/[program_id]">>(async (_request, ctx) => {
  const { program_id } = await ctx.params;
  return ok({ call: await getLpCall(program_id), funds: await applicableFunds(), applications: await listMyApplications(program_id) });
});

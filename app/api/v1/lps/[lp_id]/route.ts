import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { lpSchema } from "@/lib/schemas/lp";
import { getLp, updateLp } from "@/lib/services/lps";

type Ctx = RouteContext<"/api/v1/lps/[lp_id]">;

// GET /api/v1/lps/{lp_id} — 출자자 상세 + 조합별 참여 현황
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { lp_id } = await ctx.params;
  return ok(await getLp(lp_id));
});

// PATCH /api/v1/lps/{lp_id} — 출자자 정보 수정
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { lp_id } = await ctx.params;
  const input = await parseBody(request, lpSchema);
  await updateLp(lp_id, input);
  return ok(await getLp(lp_id));
});

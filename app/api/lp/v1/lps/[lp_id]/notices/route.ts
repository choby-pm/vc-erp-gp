import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpNotices } from "@/lib/services/lp-portal";

// GET /api/lp/v1/lps/{lp_id}/notices — 받은 통지 전체 (출자 제안 포함, 🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/notices">>(async (_request, ctx) => {
  const { lp_id } = await ctx.params;
  return ok(await lpNotices(lp_id));
});

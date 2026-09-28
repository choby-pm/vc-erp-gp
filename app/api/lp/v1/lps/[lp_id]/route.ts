import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpProfile } from "@/lib/services/lp-portal";

// GET /api/lp/v1/lps/{lp_id} — LP 기본 정보 (🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]">>(async (_request, ctx) => {
  const { lp_id } = await ctx.params;
  return ok(await lpProfile(lp_id));
});

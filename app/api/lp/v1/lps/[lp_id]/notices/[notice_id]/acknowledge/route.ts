import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { acknowledgeNotice } from "@/lib/services/lp-portal";

// POST /api/lp/v1/lps/{lp_id}/notices/{notice_id}/acknowledge — 통지 확인 처리 (BR-NTC-02)
export const POST = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/notices/[notice_id]/acknowledge">>(async (_request, ctx) => {
  const { lp_id, notice_id } = await ctx.params;
  return ok(await acknowledgeNotice(lp_id, notice_id));
});

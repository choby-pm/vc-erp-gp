import { ok } from "@/lib/api/response";
import { withLpSystem } from "@/lib/api/lp-system";
import { lpLedger } from "@/lib/services/lp-portal";

// GET …/ledger — 내 원장 (취소 행 포함, 🟢)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/ledger">>(async (_request, ctx) => {
  const { lp_id, fund_id } = await ctx.params;
  return ok(await lpLedger(lp_id, fund_id));
});

import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { endManagerSchema } from "@/lib/schemas/fund-manager";
import { endManager, listFundManagers } from "@/lib/services/fund-managers";

// POST /api/v1/funds/{fund_id}/managers/{manager_id}/end — 해임 (행은 지우지 않고 해임일만 기록, BR-MGR-04, 05)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/managers/[manager_id]/end">>(async (request, ctx) => {
  const { fund_id, manager_id } = await ctx.params;
  await endManager(fund_id, manager_id, await parseBody(request, endManagerSchema));
  return ok(await listFundManagers(fund_id));
});

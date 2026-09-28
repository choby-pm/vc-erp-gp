import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { cancelRosterSchema, confirmRosterSchema } from "@/lib/schemas/roster";
import { cancelRoster, confirmRoster, getRoster } from "@/lib/services/roster";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/roster">;

// GET /api/v1/funds/{fund_id}/roster — 명부 상태 + 조합원(약정·지분율) + 확정 후보(확약된 제안) + 취소 이력
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { fund_id } = await ctx.params;
  return ok(await getRoster(fund_id));
});

// POST /api/v1/funds/{fund_id}/roster — 명부 확정 (조합원 + 약정 원장 + 연동 이벤트, BR-MEM-01~04, 07)
export const POST = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  await confirmRoster(fund_id, await parseBody(request, confirmRosterSchema), user.id);
  return ok(await getRoster(fund_id), 201);
});

// DELETE /api/v1/funds/{fund_id}/roster — 명부 취소 { reason } (결성총회 가결·캐피탈콜 전만, 원장은 취소 행으로, BR-MEM-05)
export const DELETE = withUser<Ctx>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const { reason } = await parseBody(request, cancelRosterSchema);
  await cancelRoster(fund_id, reason, user.id);
  return ok(await getRoster(fund_id));
});

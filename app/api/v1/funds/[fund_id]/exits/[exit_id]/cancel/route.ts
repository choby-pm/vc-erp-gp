import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { cancelExit, listExits } from "@/lib/services/exits";

// POST /api/v1/funds/{fund_id}/exits/{exit_id}/cancel — 회수 취소 { reason } (지우지 않고 취소 표시 + 처분 분개 역분개, BR-EXIT-08)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/exits/[exit_id]/cancel">>(async (request, ctx, user) => {
  const { fund_id, exit_id } = await ctx.params;
  const { reason } = await parseBody(request, z.object({ reason: z.string({ error: "취소 사유를 입력하세요" }).trim().min(1, "취소 사유를 입력하세요").max(500) }));
  await cancelExit(fund_id, exit_id, reason, user.id);
  return ok(await listExits(fund_id));
});

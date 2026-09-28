import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { reverseManualJournal } from "@/lib/services/accounting";

// POST /api/v1/funds/{fund_id}/accounting/journal/{entry_id}/reverse — 수동 분개 역분개 { reason } (자동 분개는 업무 화면에서 취소, BR-ACC-02)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/accounting/journal/[entry_id]/reverse">>(async (request, ctx, user) => {
  const { fund_id, entry_id } = await ctx.params;
  const { reason } = await parseBody(request, z.object({ reason: z.string({ error: "사유를 입력하세요" }).trim().min(1, "사유를 입력하세요").max(200) }));
  return ok(await reverseManualJournal(fund_id, entry_id, reason, user.id), 201);
});

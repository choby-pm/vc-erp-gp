import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { deleteNoticeDraft } from "@/lib/services/notices";

// DELETE /api/v1/funds/{fund_id}/notices/{notice_id} — 일반 공지 초안 삭제 (발송 후에는 잠김, BR-NTC-01)
export const DELETE = withUser<RouteContext<"/api/v1/funds/[fund_id]/notices/[notice_id]">>(async (_request, ctx) => {
  const { fund_id, notice_id } = await ctx.params;
  await deleteNoticeDraft(fund_id, notice_id);
  return ok({ deleted: true });
});

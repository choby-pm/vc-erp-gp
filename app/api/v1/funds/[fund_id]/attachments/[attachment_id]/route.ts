import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { deleteAttachment } from "@/lib/services/attachments";

// DELETE /api/v1/funds/{fund_id}/attachments/{attachment_id} — 첨부 삭제 (목록·LP에서 빠지고 기록은 남음)
export const DELETE = withUser<RouteContext<"/api/v1/funds/[fund_id]/attachments/[attachment_id]">>(async (_request, ctx, user) => {
  const { fund_id, attachment_id } = await ctx.params;
  await deleteAttachment(fund_id, attachment_id, user.id);
  return ok({ deleted: true });
});

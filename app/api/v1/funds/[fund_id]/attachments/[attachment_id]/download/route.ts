import { withUser } from "@/lib/api/handler";
import { fileResponse, openAttachment } from "@/lib/services/attachments";

// GET /api/v1/funds/{fund_id}/attachments/{attachment_id}/download — 첨부 파일 보기 (로그인 필요, 비공개 Blob 을 서버가 흘려보냄)
export const GET = withUser<RouteContext<"/api/v1/funds/[fund_id]/attachments/[attachment_id]/download">>(async (_request, ctx) => {
  const { fund_id, attachment_id } = await ctx.params;
  return fileResponse(await openAttachment(fund_id, attachment_id));
});

import { withLpSystem } from "@/lib/api/lp-system";
import { fileResponse } from "@/lib/services/attachments";
import { lpAttachment } from "@/lib/services/lp-portal";

// GET …/attachments/{attachment_id} — 규약 원문·발행된 보고서 PDF 내려받기 (🔵, BR-FILE-02)
export const GET = withLpSystem<RouteContext<"/api/lp/v1/lps/[lp_id]/funds/[fund_id]/attachments/[attachment_id]">>(async (_request, ctx) => {
  const { lp_id, fund_id, attachment_id } = await ctx.params;
  return fileResponse(await lpAttachment(lp_id, fund_id, attachment_id));
});

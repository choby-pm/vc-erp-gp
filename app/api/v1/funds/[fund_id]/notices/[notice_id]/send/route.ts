import { idempotent } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { sendNotice } from "@/lib/services/notices";

// POST /api/v1/funds/{fund_id}/notices/{notice_id}/send — 일반 공지 발송 (잠금 + LP별 이벤트, Idempotency-Key 필수, BR-NTC-01)
export const POST = withUser<RouteContext<"/api/v1/funds/[fund_id]/notices/[notice_id]/send">>(async (request, ctx, user) => {
  const { fund_id, notice_id } = await ctx.params;
  return idempotent(request, user.id, async () => {
    await sendNotice(fund_id, notice_id);
    return ok({ sent: true });
  });
});

import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { resetPassword } from "@/lib/services/staff";

// POST /api/v1/staff/{staff_id}/account/reset-password — 임시 비밀번호 재발급 (기존 로그인은 모두 끊김)
export const POST = withUser<RouteContext<"/api/v1/staff/[staff_id]/account/reset-password">>(async (_request, ctx) => {
  const { staff_id } = await ctx.params;
  return ok(await resetPassword(staff_id));
});

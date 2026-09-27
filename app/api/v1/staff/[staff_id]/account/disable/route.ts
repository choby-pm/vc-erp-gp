import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getStaff, setAccountEnabled } from "@/lib/services/staff";

// POST /api/v1/staff/{staff_id}/account/disable — 로그인 계정 중지 (기존 로그인도 즉시 끊김)
export const POST = withUser<RouteContext<"/api/v1/staff/[staff_id]/account/disable">>(async (_request, ctx, user) => {
  const { staff_id } = await ctx.params;
  await setAccountEnabled(staff_id, false, user.id);
  return ok(await getStaff(staff_id));
});

import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { getStaff, setAccountEnabled } from "@/lib/services/staff";

// POST /api/v1/staff/{staff_id}/account/enable — 로그인 계정 다시 사용
export const POST = withUser<RouteContext<"/api/v1/staff/[staff_id]/account/enable">>(async (_request, ctx, user) => {
  const { staff_id } = await ctx.params;
  await setAccountEnabled(staff_id, true, user.id);
  return ok(await getStaff(staff_id));
});

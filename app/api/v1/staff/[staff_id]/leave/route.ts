import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { leaveSchema } from "@/lib/schemas/staff";
import { getStaff, leaveStaff } from "@/lib/services/staff";

// POST /api/v1/staff/{staff_id}/leave — 퇴사 처리 (로그인 계정 자동 중지, BR-STF-02)
export const POST = withUser<RouteContext<"/api/v1/staff/[staff_id]/leave">>(async (request, ctx, user) => {
  const { staff_id } = await ctx.params;
  const { left_date } = await parseBody(request, leaveSchema);
  await leaveStaff(staff_id, left_date, user.id);
  return ok(await getStaff(staff_id));
});

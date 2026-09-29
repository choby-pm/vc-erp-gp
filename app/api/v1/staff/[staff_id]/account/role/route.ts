import { z } from "zod";
import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { ROLES } from "@/lib/auth/permissions";
import { getStaff, setAccountRole } from "@/lib/services/staff";

// PUT /api/v1/staff/{staff_id}/account/role — 로그인 계정 권한 변경 { role } (관리자만, 자기 자신 불가, BR-AUTH-03)
export const PUT = withUser<RouteContext<"/api/v1/staff/[staff_id]/account/role">>(async (request, ctx, user) => {
  const { staff_id } = await ctx.params;
  const { role } = await parseBody(request, z.object({ role: z.enum(ROLES, { error: "권한을 고르세요" }) }));
  await setAccountRole(staff_id, role, user.id);
  return ok(await getStaff(staff_id));
});

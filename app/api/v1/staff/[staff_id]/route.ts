import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { staffSchema } from "@/lib/schemas/staff";
import { getStaff, updateStaff } from "@/lib/services/staff";

type Ctx = RouteContext<"/api/v1/staff/[staff_id]">;

// GET /api/v1/staff/{staff_id} — 구성원 상세 + 로그인 계정 + 담당 조합 이력
export const GET = withUser<Ctx>(async (_request, ctx) => {
  const { staff_id } = await ctx.params;
  return ok(await getStaff(staff_id));
});

// PATCH /api/v1/staff/{staff_id} — 구성원 정보 수정
export const PATCH = withUser<Ctx>(async (request, ctx) => {
  const { staff_id } = await ctx.params;
  await updateStaff(staff_id, await parseBody(request, staffSchema));
  return ok(await getStaff(staff_id));
});

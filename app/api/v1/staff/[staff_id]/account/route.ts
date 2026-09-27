import { ok } from "@/lib/api/response";
import { withUser } from "@/lib/api/handler";
import { createAccount } from "@/lib/services/staff";

// POST /api/v1/staff/{staff_id}/account — 로그인 계정 생성. 임시 비밀번호는 이 응답에서만 보인다 (BR-STF-03)
export const POST = withUser<RouteContext<"/api/v1/staff/[staff_id]/account">>(async (_request, ctx) => {
  const { staff_id } = await ctx.params;
  return ok(await createAccount(staff_id), 201);
});

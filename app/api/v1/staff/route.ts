import { ok } from "@/lib/api/response";
import { parseBody, withUser } from "@/lib/api/handler";
import { createStaffSchema } from "@/lib/schemas/staff";
import { createStaff, getStaff, listStaff } from "@/lib/services/staff";

// GET /api/v1/staff?status=active|left|all — 구성원 목록 (기본: 재직 중)
export const GET = withUser(async (request) => {
  const status = new URL(request.url).searchParams.get("status");
  return ok(await listStaff(status === "left" || status === "all" ? status : "active"));
});

// POST /api/v1/staff — 구성원 등록 (create_account: true 면 로그인 계정도 생성, 임시 비밀번호는 이 응답에서만 보임)
export const POST = withUser(async (request, _ctx, user) => {
  const { create_account, ...input } = await parseBody(request, createStaffSchema);
  const { id, account } = await createStaff(input, create_account, user.id);
  return ok({ staff: await getStaff(id), account }, 201);
});

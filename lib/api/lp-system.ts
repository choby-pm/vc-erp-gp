import { timingSafeEqual } from "node:crypto";
import { toErrorResponse } from "@/lib/api/handler";
import { fail } from "@/lib/api/response";

// LP 연동 API 인증 (05 API 설계 5-1)
// · LP 시스템 전체가 API 키 하나를 가진다: Authorization: Bearer {LP_SYSTEM_API_KEY}
// · 키는 서버 환경 변수에만 둔다. LP 사용자 로그인은 LP 시스템의 책임이고, 로그인한 사용자의 lp_id 를 주소에 넣어 호출한다

function validKey(header: string | null) {
  const expected = process.env.LP_SYSTEM_API_KEY;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function withLpSystem<Ctx>(handler: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx) => {
    try {
      if (!process.env.LP_SYSTEM_API_KEY) return fail(503, "LP_API_DISABLED", "LP 연동 API 키가 설정되지 않았습니다");
      if (!validKey(request.headers.get("authorization"))) return fail(401, "UNAUTHORIZED", "LP 시스템 API 키가 올바르지 않습니다");
      return await handler(request, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

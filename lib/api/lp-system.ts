import { timingSafeEqual } from "node:crypto";
import { toErrorResponse } from "@/lib/api/handler";
import { fail } from "@/lib/api/response";
import { errorCodeOf, writeAudit } from "@/lib/services/audit";

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

// 쓰기 요청(통지 확인·투표)은 감사 로그를 남긴다 (D42). 키가 틀린 쓰기 시도도 남긴다
export function withLpSystem<Ctx>(handler: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx) => {
    let res: Response;
    try {
      if (!process.env.LP_SYSTEM_API_KEY) res = fail(503, "LP_API_DISABLED", "LP 연동 API 키가 설정되지 않았습니다");
      else if (!validKey(request.headers.get("authorization"))) res = fail(401, "UNAUTHORIZED", "LP 시스템 API 키가 올바르지 않습니다");
      else res = await handler(request, ctx);
    } catch (err) {
      res = toErrorResponse(err);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      const path = new URL(request.url).pathname;
      const lpId = path.match(/\/lps\/([^/]+)/)?.[1] ?? null;
      await writeAudit({ actor_type: "lp_system", method: request.method, path, status: res.status, error_code: await errorCodeOf(res), detail: { lp_id: lpId }, request });
    }
    return res;
  };
}

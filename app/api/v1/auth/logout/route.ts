import { ok } from "@/lib/api/response";
import { destroySession } from "@/lib/auth/session";

// POST /api/v1/auth/logout — 세션을 만료시키고 쿠키를 지운다
export async function POST() {
  await destroySession();
  return ok({ logged_out: true });
}

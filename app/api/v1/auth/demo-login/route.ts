import { sql } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { DEMO_USER_EMAIL } from "@/lib/auth/demo";
import { createSession } from "@/lib/auth/session";

// POST /api/v1/auth/demo-login — 비밀번호 없이 데모 계정으로 로그인 (D28)
export async function POST() {
  const [user] = await sql<{ id: string; email: string; name: string }[]>`
    select id, email, name from users where email = ${DEMO_USER_EMAIL}
  `;

  if (!user) {
    return fail(404, "NOT_FOUND", "데모 계정이 아직 준비되지 않았습니다");
  }

  await createSession(user.id);
  return ok(user);
}

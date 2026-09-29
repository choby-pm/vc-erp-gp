import { sql } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { DEMO_USER_EMAIL } from "@/lib/auth/demo";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";

// POST /api/v1/auth/demo-login — 비밀번호 없이 데모 계정으로 로그인 (D28). 감사 로그를 남긴다 (D42)
export async function POST(request: Request) {
  const [user] = await sql<{ id: string; email: string; name: string; role: string }[]>`
    select id, email, name, role from users where email = ${DEMO_USER_EMAIL} and disabled_at is null
  `;

  if (!user) {
    return fail(404, "NOT_FOUND", "데모 계정이 아직 준비되지 않았습니다");
  }

  await createSession(user.id);
  await writeAudit({ actor_type: "user", user, method: "POST", path: "/api/v1/auth/demo-login", status: 200, request });
  return ok({ id: user.id, email: user.email, name: user.name });
}

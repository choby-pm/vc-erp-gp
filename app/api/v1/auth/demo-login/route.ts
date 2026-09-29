import { sql } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { DEMO_USER_EMAIL, demoIsReadOnly } from "@/lib/auth/demo";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";

// POST /api/v1/auth/demo-login — 비밀번호 없이 데모 계정으로 로그인 (D28). 감사 로그를 남긴다 (D42)
// 배포 환경에서는 조회 전용 세션 (D43)
export async function POST(request: Request) {
  const [user] = await sql<{ id: string; email: string; name: string; role: string }[]>`
    select id, email, name, role from users where email = ${DEMO_USER_EMAIL} and disabled_at is null
  `;

  if (!user) {
    return fail(404, "NOT_FOUND", "데모 계정이 아직 준비되지 않았습니다");
  }

  const readOnly = demoIsReadOnly();
  await createSession(user.id, { roleCap: readOnly ? "viewer" : null });
  await writeAudit({ actor_type: "user", user: { ...user, role: readOnly ? "viewer" : user.role }, method: "POST", path: "/api/v1/auth/demo-login", status: 200, detail: readOnly ? { read_only: true } : null, request });
  return ok({ id: user.id, email: user.email, name: user.name });
}

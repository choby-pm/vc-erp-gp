import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { AppError } from "./errors";
import { fail, readJson } from "./response";

// 로그인이 필요한 API의 공통 처리
//   1. 로그인 확인 → 없으면 401
//   2. 본래 처리 실행
//   3. 던져진 오류를 공통 실패 응답으로 변환
export function withUser<Ctx>(handler: (request: Request, ctx: Ctx, user: CurrentUser) => Promise<Response>) {
  return async (request: Request, ctx: Ctx) => {
    try {
      const user = await getCurrentUser();
      if (!user) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
      return await handler(request, ctx, user);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    return fail(err.status, err.code, err.message, { rule: err.rule, details: err.details });
  }
  // DB 제약 조건 위반 (03 DB 설계 5장) — 서버 검사를 통과했더라도 DB가 최후에 막은 경우
  const pgCode = (err as { code?: string }).code;
  if (pgCode === "23505") return fail(409, "CONFLICT", "이미 같은 값이 등록되어 있습니다");
  if (pgCode === "23514" || pgCode === "23P01") {
    return fail(422, "CONSTRAINT_VIOLATION", "데이터 규칙에 맞지 않습니다");
  }
  console.error(err);
  return fail(500, "INTERNAL_ERROR", "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요");
}

// 요청 본문을 읽고 검사한다. 문제가 있으면 400 VALIDATION_ERROR (항목별 안내 포함)
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const body = await readJson(request);
  if (body === null) throw new AppError(400, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다");

  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new AppError(400, "VALIDATION_ERROR", "입력값을 확인하세요", undefined, { fields });
  }
  return result.data;
}

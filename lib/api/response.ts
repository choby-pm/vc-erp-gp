import { NextResponse } from "next/server";

// 05 API 설계 2-3의 공통 응답 형식
//   성공: { "data": ... }
//   실패: { "error": { "code", "message", "rule"?, "details"? } }

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

type ErrorOptions = { rule?: string; details?: Record<string, unknown> };

export function fail(status: number, code: string, message: string, options: ErrorOptions = {}) {
  return NextResponse.json({ error: { code, message, ...options } }, { status });
}

// 요청 본문을 JSON으로 읽는다. 형식이 잘못되면 null
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

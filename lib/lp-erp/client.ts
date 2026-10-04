import { AppError } from "@/lib/api/errors";
import { signWebhook } from "@/lib/services/integration";

// GP가 LP ERP를 부르는 요청 (D47, LP L50). 새 키 없이 웹훅과 같은 비밀 값(LP_WEBHOOK_SECRET)으로 서명한다
// · LP 주소와 LP 쪽 연결 ID는 웹훅 주소(LP_SYSTEM_WEBHOOK_URL = {LP}/api/webhooks/gp/{connection_id})에서 얻는다
// · 서명 = sha256=HMAC(비밀 값, 타임스탬프 + "." + "<METHOD> <경로+쿼리>\n<본문>") — 🔗 LP lib/gp/signed-request.ts
// · LP에 닿지 못하면 LP_ERP_UNAVAILABLE(502), 설정이 없으면 LP_ERP_NOT_CONFIGURED(503)

export function lpErpConfig() {
  const url = process.env.LP_SYSTEM_WEBHOOK_URL ?? "";
  const secret = process.env.LP_WEBHOOK_SECRET ?? "";
  const m = url.match(/^(https?:\/\/[^/]+)\/api\/webhooks\/gp\/([0-9a-f-]{36})\/?$/i);
  if (!m || !secret) return null;
  return { base: m[1], connectionId: m[2], secret };
}

export type LpErpResponse<T> = { status: number; data: T | null; error: { code: string; message: string } | null };

export async function lpErpRequest<T>(method: "GET" | "POST", pathWithQuery: string, body?: unknown): Promise<LpErpResponse<T>> {
  const cfg = lpErpConfig();
  if (!cfg) throw new AppError(503, "LP_ERP_NOT_CONFIGURED", "LP ERP 연동 설정(LP_SYSTEM_WEBHOOK_URL · LP_WEBHOOK_SECRET)이 없습니다");
  const raw = body === undefined ? "" : JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const signature = signWebhook(cfg.secret, timestamp, `${method} ${pathWithQuery}\n${raw}`);
  let res: Response;
  try {
    res = await fetch(cfg.base + pathWithQuery, {
      method,
      headers: { "Content-Type": "application/json", "X-LP-Connection-Id": cfg.connectionId, "X-GP-Timestamp": timestamp, "X-GP-Signature": signature },
      body: method === "GET" ? undefined : raw,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new AppError(502, "LP_ERP_UNAVAILABLE", "LP ERP에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요");
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
  if (res.status >= 500) throw new AppError(502, "LP_ERP_UNAVAILABLE", `LP ERP가 응답하지 못했습니다 (HTTP ${res.status})`);
  return { status: res.status, data: json.data ?? null, error: json.error ?? null };
}

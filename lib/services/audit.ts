import { sql } from "@/lib/db";

// 감사 로그 (D42, BR-AUTH-04)
// · 모든 쓰기 요청(GP 사용자·LP 시스템·주기 작업)과 로그인 시도를 남긴다. 권한 없어 막힌 요청도 남긴다
// · 요청 본문은 저장하지 않는다 (비밀번호 등). 무엇을 했는지는 주소 모양(action)과 결과 코드로 본다
// · 기록이 실패해도 본래 요청은 실패시키지 않는다 (로그는 부가 기능)

export type AuditActor = "user" | "lp_system" | "cron";
export type AuditEntry = {
  actor_type: AuditActor;
  user?: { id: string; name: string; role: string } | null;
  method: string;
  path: string;
  status: number;
  error_code?: string | null;
  detail?: Record<string, unknown> | null;
  request?: Request;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /api/v1/funds/{uuid}/exits/{uuid}/cancel → /funds/:id/exits/:id/cancel (숫자 구간은 :n)
export function actionOf(method: string, path: string) {
  const shape = path
    .replace(/^\/api\/(lp\/)?v1/, "")
    .split("/")
    .map((s) => (UUID.test(s) ? ":id" : /^\d+$/.test(s) ? ":n" : s))
    .join("/");
  return `${method} ${shape}`;
}

function fundIdOf(path: string) {
  const m = path.match(/\/funds\/([0-9a-f-]{36})(\/|$)/i);
  return m && UUID.test(m[1]) ? m[1] : null;
}

export async function writeAudit(e: AuditEntry) {
  try {
    const forwarded = e.request?.headers.get("x-forwarded-for");
    await sql`
      insert into audit_logs (actor_type, user_id, user_name, user_role, method, path, action, fund_id, status, error_code, detail, ip, user_agent)
      values (${e.actor_type}, ${e.user?.id ?? null}, ${e.user?.name ?? null}, ${e.user?.role ?? null}, ${e.method}, ${e.path},
              ${actionOf(e.method, e.path)}, ${fundIdOf(e.path)}, ${e.status}, ${e.error_code ?? null},
              ${e.detail ? sql.json(e.detail as never) : null}, ${forwarded?.split(",")[0].trim() ?? null},
              ${e.request?.headers.get("user-agent")?.slice(0, 300) ?? null})
    `;
  } catch (err) {
    console.error("감사 로그 기록 실패", err);
  }
}

// 응답에서 오류 코드만 꺼낸다 (본문은 그대로 돌려줘야 하므로 복제해서 읽는다)
export async function errorCodeOf(res: Response) {
  if (res.status < 400) return null;
  try {
    return ((await res.clone().json()) as { error?: { code?: string } }).error?.code ?? null;
  } catch {
    return null;
  }
}

// ─── 조회 (감사 로그 화면) ─────────────────────────────────────────────────

export type AuditLog = {
  id: string;
  occurred_at: Date;
  actor_type: AuditActor;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  method: string;
  path: string;
  action: string;
  fund_id: string | null;
  fund_name: string | null;
  status: number;
  error_code: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
};

export type AuditFilter = { user_id?: string | null; fund_id?: string | null; result?: "ok" | "fail" | "denied" | null; from?: string | null; to?: string | null };

export async function listAuditLogs(f: AuditFilter = {}, limit = 200) {
  const userId = f.user_id && UUID.test(f.user_id) ? f.user_id : null;
  const fundId = f.fund_id && UUID.test(f.fund_id) ? f.fund_id : null;
  const logs = await sql<AuditLog[]>`
    select a.id, a.occurred_at, a.actor_type, a.user_id, a.user_name, a.user_role, a.method, a.path, a.action, a.fund_id, fu.name as fund_name,
           a.status, a.error_code, a.detail, a.ip
    from audit_logs a left join funds fu on fu.id = a.fund_id
    where (${userId}::uuid is null or a.user_id = ${userId}::uuid)
      and (${fundId}::uuid is null or a.fund_id = ${fundId}::uuid)
      and (${f.result ?? null}::text is null
           or (${f.result ?? null} = 'ok' and a.status < 400)
           or (${f.result ?? null} = 'fail' and a.status >= 400)
           or (${f.result ?? null} = 'denied' and a.status in (401, 403)))
      and (${f.from ?? null}::date is null or a.occurred_at >= (${f.from ?? null}::date)::timestamp at time zone 'Asia/Seoul')
      and (${f.to ?? null}::date is null or a.occurred_at < (${f.to ?? null}::date + 1)::timestamp at time zone 'Asia/Seoul')
    order by a.occurred_at desc
    limit ${limit}
  `;
  const users = await sql<{ id: string; name: string }[]>`
    select distinct u.id, u.name from audit_logs a join users u on u.id = a.user_id order by u.name
  `;
  const funds = await sql<{ id: string; name: string }[]>`
    select distinct f.id, f.name from audit_logs a join funds f on f.id = a.fund_id order by f.name
  `;
  return { logs, users, funds, limit };
}

// 주소 모양 → 사람이 읽는 작업 이름. 목록에 없으면 주소 모양을 그대로 보여준다
const LABELS: [RegExp, string][] = [
  [/^POST \/auth\/login$/, "로그인"],
  [/^POST \/auth\/demo-login$/, "데모 로그인"],
  [/^POST \/auth\/logout$/, "로그아웃"],
  [/^POST \/funds$/, "조합 생성"],
  [/^PATCH \/funds\/:id$/, "조합 정보 수정"],
  [/^POST \/funds\/:id\/transitions$/, "조합 상태 변경"],
  [/\/proposals\/:id\/send$/, "출자 제안 발송"],
  [/\/proposals\/:id\/transitions$/, "출자 제안 응답 기록"],
  [/^POST \/funds\/:id\/proposals$/, "출자 제안 작성"],
  [/\/roster$/, "조합원 명부"],
  [/\/capital-calls\/:id\/issue$/, "캐피탈콜 발송"],
  [/\/capital-calls\/:id\/close$/, "캐피탈콜 마감"],
  [/\/capital-calls\/:id\/items\/:id\/payments$/, "납입 확인"],
  [/^POST \/funds\/:id\/capital-calls$/, "캐피탈콜 작성"],
  [/\/ledger\/:id\/reversal$/, "납입 취소"],
  [/\/management-fees$/, "관리보수 청구"],
  [/\/expenses\/:id\/cancel$/, "비용 취소"],
  [/\/expenses$/, "비용 기록"],
  [/\/investments$/, "투자 집행"],
  [/\/valuations$/, "평가 기록"],
  [/\/exits\/:id\/cancel$/, "회수 취소"],
  [/\/exits$/, "회수 기록"],
  [/\/distributions\/:id\/confirm$/, "분배 확정"],
  [/\/distributions\/:id\/pay$/, "분배 지급"],
  [/\/distributions\/:id\/cancel$/, "분배 취소"],
  [/^DELETE \/funds\/:id\/distributions\/:id$/, "분배 초안 삭제"],
  [/^POST \/funds\/:id\/distributions$/, "분배 작성"],
  [/\/accounting\/closings\/:n\/reopen$/, "결산 재개"],
  [/\/accounting\/closings$/, "결산"],
  [/\/accounting\/journal\/:id\/reverse$/, "역분개"],
  [/\/accounting\/journal$/, "수동 분개"],
  [/\/meetings\/:id\/convene$/, "총회 소집"],
  [/\/meetings\/:id\/hold$/, "총회 개최 처리"],
  [/\/meetings\/:id\/cancel$/, "총회 취소"],
  [/\/votes(\/:id)?$/, "투표"],
  [/\/meetings\/:id\/agendas$/, "안건 추가"],
  [/^POST \/funds\/:id\/meetings$/, "총회 생성"],
  [/\/reports\/:id\/publish$/, "보고서 발행"],
  [/\/reports/, "정기 보고"],
  [/\/terms/, "규약"],
  [/\/notices\/:id\/acknowledge$/, "통지 확인 (LP)"],
  [/\/notices\/:id\/send$/, "공지 발송"],
  [/\/notices/, "공지"],
  [/^(POST|DELETE) \/funds\/:id\/attachments/, "파일 첨부"],
  [/\/managers/, "운용 인력"],
  [/\/institutions/, "관계 기관"],
  [/\/members\/:id\/commitment-increases$/, "약정 증액"],
  [/\/registration$/, "등록 정보"],
  [/\/account\/role$/, "권한 변경"],
  [/\/account\/reset-password$/, "비밀번호 초기화"],
  [/\/account\/(disable|enable)$/, "계정 중지·재개"],
  [/\/account$/, "로그인 계정 생성"],
  [/\/leave$/, "퇴사 처리"],
  [/^(POST|PATCH) \/staff/, "구성원"],
  [/\/integration-events\/dispatch$/, "이벤트 전송"],
  [/\/integration-events\/:id\/retry$/, "이벤트 재전송"],
  [/\/cron\/dispatch-events$/, "이벤트 자동 전송"],
  [/^(POST|PATCH) \/deals/, "딜"],
  [/^(POST|PATCH) \/companies/, "기업"],
  [/^(POST|PATCH) \/lps/, "출자자"],
];

export function actionLabel(action: string) {
  return LABELS.find(([re]) => re.test(action))?.[1] ?? action;
}

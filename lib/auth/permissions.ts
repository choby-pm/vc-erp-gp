// 역할별 권한 (D42, BR-AUTH-01~03)
// · 역할 4종: 관리자(admin) · 운용(manager) · 재무(finance) · 조회(viewer)
// · GP 내부 API(/api/v1)의 모든 요청이 withUser 에서 여기를 거친다. 규칙은 위에서부터 처음 맞는 것 하나를 쓴다
// · 조회(GET)는 기본적으로 모두 허용하고, 규칙에 read 를 적은 것만 막는다. 쓰기는 기본이 "운용"
// · 관리자는 모든 작업을 할 수 있다
// · 화면의 버튼은 역할과 관계없이 보일 수 있지만, 서버가 막고 이유를 알려준다 (메뉴만 역할에 맞게 숨긴다)

export const ROLES = ["admin", "manager", "finance", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { admin: "관리자", manager: "운용", finance: "재무", viewer: "조회" };
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "모든 작업 + 구성원·계정·권한, LP 연동, 감사 로그",
  manager: "딜·투자·조합 운영 업무 기록 (캐피탈콜 발송, 회수, 분배 확정, 총회, 보고 등)",
  finance: "회계·결산, 비용·관리보수, 납입 확인, 분배 지급, 납입 취소",
  viewer: "모든 화면 조회만",
};

type Rule = { pattern: RegExp; write?: Role[]; read?: Role[]; area: string };

const ID = "[^/]+";
const fund = (rest: string) => new RegExp(`^/funds/${ID}/${rest}`);

// admin 은 항상 허용되므로 목록에 적지 않는다
const RULES: Rule[] = [
  // 계산만 하고 저장하지 않는 미리보기 (POST 지만 조회와 같다)
  { pattern: /\/preview$/, write: ["manager", "finance", "viewer"], area: "미리보기" },
  // 관리자 전용
  { pattern: /^\/staff(\/|$)/, write: [], area: "구성원·계정" },
  { pattern: /^\/integration-events(\/|$)/, write: [], read: [], area: "LP 연동" },
  { pattern: /^\/audit-logs(\/|$)/, write: [], read: [], area: "감사 로그" },
  // 재무
  { pattern: fund("accounting/"), write: ["finance"], area: "회계·결산" },
  { pattern: fund("expenses(/|$)"), write: ["finance"], area: "기타 비용" },
  { pattern: fund("management-fees$"), write: ["finance"], area: "관리보수" },
  { pattern: fund(`capital-calls/${ID}/items/${ID}/payments$`), write: ["finance"], area: "납입 확인" },
  { pattern: fund(`distributions/${ID}/pay$`), write: ["finance"], area: "분배 지급" },
  { pattern: fund(`ledger/${ID}/reversal$`), write: ["finance"], area: "납입 취소" },
  // 운용·재무 함께
  { pattern: fund(`distributions/${ID}/cancel$`), write: ["manager", "finance"], area: "분배 취소" },
  { pattern: fund("attachments(/|$)"), write: ["manager", "finance"], area: "파일 첨부" },
];
const DEFAULT_WRITE: Role[] = ["manager"];

export type Decision = { allowed: true } | { allowed: false; area: string; roles: Role[] };

// path 는 /api/v1 을 뺀 주소 (예: /funds/…/exits)
export function authorize(role: Role, method: string, path: string): Decision {
  if (role === "admin") return { allowed: true };
  const reading = method === "GET" || method === "HEAD";
  const rule = RULES.find((r) => r.pattern.test(path));
  const roles = reading ? rule?.read : (rule?.write ?? DEFAULT_WRITE);
  if (!roles || roles.includes(role)) return { allowed: true };
  return { allowed: false, area: rule?.area ?? "업무 기록", roles: ["admin", ...roles] };
}

// LP 연동 · 감사 로그 화면, 구성원 계정 관리는 관리자만
export const isAdmin = (role: Role) => role === "admin";

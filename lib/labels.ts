// 코드값 → 화면 표시 이름 (02 용어 정의 기준)

export const FUND_TYPES = ["venture", "individual", "new_tech"] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const FUND_TYPE_LABEL: Record<FundType, string> = {
  venture: "벤처투자조합",
  individual: "개인투자조합",
  new_tech: "신기술사업투자조합",
};

// 결성 주체 유형 (D29)
export const GP_TYPES = ["accelerator", "venture_capital", "new_tech_finance", "other"] as const;
export type GpType = (typeof GP_TYPES)[number];

export const GP_TYPE_LABEL: Record<GpType, string> = {
  accelerator: "창업기획자 (액셀러레이터)",
  venture_capital: "벤처투자회사 (구 창투사)",
  new_tech_finance: "신기술사업금융회사 (신기사)",
  other: "기타 (개인 등)",
};

export const FUND_STATUSES = ["planning", "fundraising", "formed", "operating", "dissolved", "liquidated"] as const;
export type FundStatus = (typeof FUND_STATUSES)[number];

export const FUND_STATUS_LABEL: Record<FundStatus, string> = {
  planning: "기획",
  fundraising: "모집 중",
  formed: "결성 완료",
  operating: "운용 중",
  dissolved: "해산",
  liquidated: "청산 완료",
};

export const LP_TYPES = ["policy", "pension", "financial", "corporate", "individual", "other"] as const;
export type LpType = (typeof LP_TYPES)[number];

export const LP_TYPE_LABEL: Record<LpType, string> = {
  policy: "정책 출자기관",
  pension: "연기금·공제회",
  financial: "금융기관",
  corporate: "일반 기업",
  individual: "개인",
  other: "기타",
};

// 기본 정보·규약 버전 1을 고칠 수 있는 상태 (BR-FUND-08, BR-TERM-01)
export const EDITABLE_FUND_STATUSES: FundStatus[] = ["planning", "fundraising"];

// 조합 운용 인력 역할 (D32)
export const MANAGER_ROLES = ["lead", "key", "general"] as const;
export type ManagerRole = (typeof MANAGER_ROLES)[number];

export const MANAGER_ROLE_LABEL: Record<ManagerRole, string> = {
  lead: "대표펀드매니저",
  key: "핵심운용인력",
  general: "운용인력",
};

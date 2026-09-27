// 코드값 → 화면 표시 이름 (02 용어 정의 기준)

export const FUND_TYPES = ["venture", "new_tech"] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const FUND_TYPE_LABEL: Record<FundType, string> = {
  venture: "벤처투자조합",
  new_tech: "신기술사업투자조합",
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

// 기본 정보·규약 버전 1을 고칠 수 있는 상태 (BR-FUND-08, BR-TERM-01)
export const EDITABLE_FUND_STATUSES: FundStatus[] = ["planning", "fundraising"];

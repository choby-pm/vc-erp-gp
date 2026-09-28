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

// 출자 제안 상태 (BR-PROP-01)
export const PROPOSAL_STATUSES = ["proposed", "reviewing", "committed", "declined"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  proposed: "제안",
  reviewing: "검토 중",
  committed: "확약",
  declined: "거절",
};

// 조합원 총회 (단계 5, 결성총회는 단계 3)
export const MEETING_TYPES = ["formation", "regular", "extraordinary", "dissolution"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  formation: "결성총회",
  regular: "정기총회",
  extraordinary: "임시총회",
  dissolution: "해산총회",
};

export const MEETING_STATUSES = ["scheduled", "held", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "예정",
  held: "개최 완료",
  cancelled: "취소",
};

export const AGENDA_TYPES = ["formation", "terms_amendment", "manager_change", "report_approval", "dissolution", "other"] as const;
export type AgendaType = (typeof AGENDA_TYPES)[number];

export const AGENDA_TYPE_LABEL: Record<AgendaType, string> = {
  formation: "조합 결성",
  terms_amendment: "규약 변경",
  manager_change: "운용 인력 교체",
  report_approval: "보고 승인",
  dissolution: "조합 해산",
  other: "기타",
};

export type AgendaResult = "pending" | "passed" | "rejected";

export const AGENDA_RESULT_LABEL: Record<AgendaResult, string> = {
  pending: "표결 전",
  passed: "가결",
  rejected: "부결",
};

export const VOTE_CHOICES = ["for", "against", "abstain"] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];

// 딜 파이프라인 (BR-DEAL-01)
export const DEAL_STAGES = ["sourcing", "reviewing", "ic", "approved", "dropped"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  sourcing: "발굴",
  reviewing: "검토",
  ic: "투심위",
  approved: "투자 확정",
  dropped: "드롭",
};

// 허용 이동: 앞으로 한 단계씩, 어느 단계에서든 드롭, 투심위에서 검토로 되돌리기(보완 요청)
export const DEAL_NEXT: Record<DealStage, DealStage[]> = {
  sourcing: ["reviewing", "dropped"],
  reviewing: ["ic", "dropped"],
  ic: ["approved", "reviewing", "dropped"],
  approved: [],
  dropped: [],
};

// 투자 증권 종류
export const SECURITY_TYPES = ["common", "preferred", "rcps", "cb", "bw", "other"] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];

export const SECURITY_TYPE_LABEL: Record<SecurityType, string> = {
  common: "보통주",
  preferred: "우선주",
  rcps: "상환전환우선주 (RCPS)",
  cb: "전환사채 (CB)",
  bw: "신주인수권부사채 (BW)",
  other: "기타",
};

// 조합 기타 비용 (관리보수 외, D34)
export const EXPENSE_TYPES = ["audit", "custody", "administration", "organization", "legal", "tax", "other"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  audit: "회계감사 수수료",
  custody: "수탁 보수",
  administration: "사무관리 보수",
  organization: "설립 비용",
  legal: "법률·자문 비용",
  tax: "세금·공과금",
  other: "기타",
};

// 조합 현금 흐름 구분 (재무 탭)
export type CashFlowKind = "contribution" | "investment" | "management_fee" | "expense" | "exit" | "distribution";

// 현금출납장의 거래 구분 (회계 용어)
export const CASH_FLOW_LABEL: Record<CashFlowKind, string> = {
  contribution: "출자금 수입",
  investment: "투자자산 취득",
  management_fee: "관리보수 지급",
  expense: "비용 지급",
  exit: "투자자산 처분",
  distribution: "분배금 지급",
};

// 관계 기관 (단계 3. 결성)
export const INSTITUTION_TYPES = ["custodian", "administrator", "auditor"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const INSTITUTION_TYPE_LABEL: Record<InstitutionType, string> = {
  custodian: "수탁은행",
  administrator: "사무관리사",
  auditor: "회계감사인",
};

// 출자 요청 (캐피탈콜)
export type CallStatus = "draft" | "issued" | "closed";
export const CALL_STATUS_LABEL: Record<CallStatus, string> = { draft: "초안", issued: "발송됨", closed: "마감" };

// 조합원별 납입 상태 (BR-CALL-11, v_capital_call_item_status 에서 계산)
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue";
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { pending: "납입 대기", partial: "일부 납입", paid: "완납", overdue: "기한 초과" };

export const VOTE_CHOICE_LABEL: Record<VoteChoice, string> = {
  for: "찬성",
  against: "반대",
  abstain: "기권",
};

// 회수 형태 (BR-EXIT-04: 상각은 회수 금액 0)
export const EXIT_TYPES = ["ipo", "trade_sale", "m_and_a", "redemption", "write_off"] as const;
export type ExitType = (typeof EXIT_TYPES)[number];
export const EXIT_TYPE_LABEL: Record<ExitType, string> = {
  ipo: "IPO 후 매각",
  trade_sale: "구주 매각",
  m_and_a: "M&A",
  redemption: "상환",
  write_off: "상각",
};

// 분배 (BR-DIST-04~06)
export type DistributionStatus = "draft" | "confirmed" | "paid";
export const DISTRIBUTION_STATUS_LABEL: Record<DistributionStatus, string> = { draft: "초안", confirmed: "확정", paid: "지급 완료" };

// 워터폴 단계 (04 업무 규칙 10-1)
export const DISTRIBUTION_COMPONENTS = ["return_of_capital", "hurdle_return", "profit", "carried_interest"] as const;
export type DistributionComponent = (typeof DISTRIBUTION_COMPONENTS)[number];
export const DISTRIBUTION_COMPONENT_LABEL: Record<DistributionComponent, string> = {
  return_of_capital: "원금 반환",
  hurdle_return: "기준수익",
  profit: "초과수익",
  carried_interest: "성과보수",
};

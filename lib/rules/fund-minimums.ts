import type { FundType, GpType } from "@/lib/labels";

// 펀드 유형 × 결성 주체별 최소 결성 기준 (D29, BR-FUND-09, BR-TERM-05)
//
// 법령이 바뀌면 이 표만 고친다. 화면(안내 문구)과 서버(검사)가 모두 이 표를 쓴다.
// 출처: 사용자 제공 기준 (2026-09-27). ⚠️ 법령 원문 확인 필요 — docs/98_practice_check.md

export type FundMinimum = {
  minFundAmount: number | null; // 최소 결성액 (원). null 이면 확인된 기준 없음
  minUnitAmount: number | null; // 1좌 최소 금액 (원)
  basis: string; // 화면에 보여줄 기준 설명
};

const EOK = 100_000_000; // 1억

export function getFundMinimum(fundType: FundType, gpType: GpType): FundMinimum {
  switch (fundType) {
    case "venture":
      return gpType === "accelerator"
        ? { minFundAmount: 10 * EOK, minUnitAmount: null, basis: "창업기획자가 결성하는 벤처투자조합" }
        : { minFundAmount: 20 * EOK, minUnitAmount: null, basis: "벤처투자회사·신기사가 결성하는 벤처투자조합" };
    case "individual":
      return { minFundAmount: 1 * EOK, minUnitAmount: 1_000_000, basis: "개인투자조합" };
    case "new_tech":
      return { minFundAmount: null, minUnitAmount: null, basis: "신기술사업투자조합 (최소 기준 확인 필요)" };
  }
}

// 이 금액을 넘으면 오타일 가능성이 높아 화면에서 확인을 요청한다 (저장은 허용)
export const LARGE_AMOUNT_WARNING = 10_000 * EOK; // 1조

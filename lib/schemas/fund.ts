import { z } from "zod";
import { FUND_STRATEGIES, FUND_TYPES, GP_TYPES } from "@/lib/labels";

// 조합 API 요청 형식 (05 API 설계 3-3). 비율은 소수(0.02 = 2%)로 받는다

const ratio = (label: string) =>
  z.number({ error: `${label}을(를) 입력하세요` }).min(0, `${label}은(는) 0% 이상이어야 합니다`).max(1, `${label}은(는) 100% 이하여야 합니다`);

export const fundBasicSchema = z
  .object({
    name: z.string({ error: "조합명을 입력하세요" }).trim().min(1, "조합명을 입력하세요").max(100, "조합명은 100자 이하로 입력하세요"),
    fund_type: z.enum(FUND_TYPES, { error: "조합 유형을 선택하세요" }),
    strategy: z.enum(FUND_STRATEGIES, { error: "조합 분야를 선택하세요" }), // 출자기관 공고 부문과 맞춰 본다 (D47)
    gp_type: z.enum(GP_TYPES, { error: "결성 주체 유형을 선택하세요" }),
    target_amount: z
      .number({ error: "목표 결성액을 입력하세요" })
      .int("목표 결성액은 원 단위 정수로 입력하세요")
      .positive("목표 결성액은 0보다 커야 합니다")
      .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다"),
    term_years: z.number({ error: "존속 기간을 입력하세요" }).int("존속 기간은 정수(년)로 입력하세요").min(1, "존속 기간은 1년 이상이어야 합니다").max(30, "존속 기간은 30년 이하로 입력하세요"),
    investment_period_years: z
      .number({ error: "투자 기간을 입력하세요" })
      .int("투자 기간은 정수(년)로 입력하세요")
      .min(1, "투자 기간은 1년 이상이어야 합니다"),
  })
  .refine((v) => v.investment_period_years <= v.term_years, {
    message: "투자 기간은 존속 기간보다 길 수 없습니다",
    path: ["investment_period_years"],
  });

export const fundTermsSchema = z.object({
  primary_purpose: z.string({ error: "주목적 투자 분야를 입력하세요" }).trim().min(1, "주목적 투자 분야를 입력하세요").max(200),
  unit_amount: z
    .number({ error: "1좌 금액을 입력하세요" })
    .int("1좌 금액은 원 단위 정수로 입력하세요")
    .positive("1좌 금액은 0보다 커야 합니다")
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다"),
  primary_purpose_min_ratio: ratio("주목적 의무 비율"),
  gp_commitment_min_ratio: ratio("GP 의무 출자 비율"),
  management_fee_rate: ratio("관리보수율(투자 기간)"),
  management_fee_rate_after: ratio("관리보수율(투자 기간 후)"),
  carry_rate: ratio("성과보수율"),
  hurdle_rate: ratio("기준수익률"),
  quorum_ratio: ratio("가결 기준").refine((v) => v > 0, "가결 기준은 0%보다 커야 합니다"),
});

export const createFundSchema = z.object({
  fund: fundBasicSchema,
  terms: fundTermsSchema,
});

// 규약 새 버전 (결성 이후, 가결 안건 필수, BR-TERM-02·03)
export const newTermsSchema = fundTermsSchema.extend({
  agenda_id: z.uuid("근거 안건을 선택하세요"),
  effective_date: z.string({ error: "적용일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "적용일은 YYYY-MM-DD 형식입니다"),
});

export type NewTermsInput = z.infer<typeof newTermsSchema>;
export type FundBasicInput = z.infer<typeof fundBasicSchema>;
export type FundTermsInput = z.infer<typeof fundTermsSchema>;

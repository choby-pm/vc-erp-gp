import { z } from "zod";

// 기업가치 평가 API 요청 형식 (05 API 설계 3-7)

export const valuationSchema = z.object({
  company_id: z.uuid("기업을 선택하세요"),
  valuation_date: z.string({ error: "평가 기준일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "평가 기준일은 YYYY-MM-DD 형식입니다"),
  fair_value_amount: z
    .number({ error: "평가액을 입력하세요" })
    .int("평가액은 원 단위 정수로 입력하세요")
    .min(0, "평가액은 0원 이상이어야 합니다")
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다"),
  method: z
    .string()
    .trim()
    .max(100, "100자 이하로 입력하세요")
    .nullish()
    .transform((v) => (v ? v : null)), // 예: 최근 투자 단가, DCF, 유사기업 비교
});

export type ValuationInput = z.infer<typeof valuationSchema>;

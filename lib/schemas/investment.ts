import { z } from "zod";
import { SECURITY_TYPES } from "@/lib/labels";

// 투자 집행 API 요청 형식 (05 API 설계 4-3)

const positiveInt = (label: string) =>
  z
    .number({ error: `${label}을(를) 숫자로 입력하세요` })
    .int(`${label}은(는) 정수로 입력하세요`)
    .positive(`${label}은(는) 0보다 커야 합니다`)
    .max(Number.MAX_SAFE_INTEGER, "값이 너무 큽니다");

export const investmentSchema = z
  .object({
    is_follow_on: z.boolean().default(false),
    deal_id: z.uuid("딜을 선택하세요").nullish().transform((v) => v ?? null), // 신규 투자
    company_id: z.uuid("기업을 선택하세요").nullish().transform((v) => v ?? null), // 후속 투자
    investment_date: z.string({ error: "투자일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "투자일은 YYYY-MM-DD 형식입니다"),
    investment_amount: positiveInt("투자 금액"),
    security_type: z.enum(SECURITY_TYPES, { error: "투자 형태를 선택하세요" }),
    shares: positiveInt("주식 수").nullish().transform((v) => v ?? null),
    price_per_share: positiveInt("주당 가격").nullish().transform((v) => v ?? null),
    is_primary_purpose: z.boolean().default(false), // 주목적 투자 분야 해당 여부 (BR-INV-06)
  })
  .refine((v) => (v.is_follow_on ? v.company_id !== null : v.deal_id !== null), {
    message: "신규 투자는 딜을, 후속 투자는 기업을 선택하세요",
    path: ["deal_id"],
  });

export type InvestmentInput = z.infer<typeof investmentSchema>;

import { z } from "zod";

// 분배 API 요청 형식 (05 API 설계 3-12, 4-5)

export const distributionSchema = z.object({
  distribution_date: z.string({ error: "분배일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "분배일은 YYYY-MM-DD 형식입니다"),
  distributable_amount: z
    .number({ error: "분배 금액을 숫자로 입력하세요" })
    .int("분배 금액은 정수로 입력하세요")
    .positive("분배 금액은 0보다 커야 합니다")
    .max(Number.MAX_SAFE_INTEGER, "값이 너무 큽니다"),
  is_final: z.boolean().default(false),
  memo: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export type DistributionInput = z.infer<typeof distributionSchema>;

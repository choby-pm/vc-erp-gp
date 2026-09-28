import { z } from "zod";

// 캐피탈콜 API 요청 형식 (05 API 설계 3-6, 4-1, 4-2)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const amount = (label: string) =>
  z
    .number({ error: `${label}을(를) 입력하세요` })
    .int(`${label}은(는) 원 단위 정수로 입력하세요`)
    .positive(`${label}은(는) 0보다 커야 합니다`)
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다");

// 미리보기·생성·초안 수정이 같은 계산 입력을 쓴다
export const capitalCallSchema = z
  .object({
    total_call_amount: amount("요청액").nullish().transform((v) => v ?? null),
    call_all_unfunded: z.boolean().default(false), // true 면 조합원별 잔여 약정 전액 (BR-CALL-05)
    call_date: date("요청일"),
    due_date: date("납입 기한"),
    purpose: z
      .string()
      .trim()
      .max(500, "500자 이하로 입력하세요")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => v.call_all_unfunded || v.total_call_amount !== null, { message: "요청액을 입력하세요", path: ["total_call_amount"] })
  .refine((v) => v.due_date >= v.call_date, { message: "납입 기한은 요청일 이후여야 합니다", path: ["due_date"] }); // BR-CALL-06

export const paymentSchema = z.object({
  paid_amount: amount("납입액"),
  paid_date: date("납입일"),
  memo: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type CapitalCallInput = z.infer<typeof capitalCallSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;

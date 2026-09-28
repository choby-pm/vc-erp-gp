import { z } from "zod";
import { EXIT_TYPES } from "@/lib/labels";

// 회수 기록 API 요청 형식 (05 API 설계 3-8)

const amount = (label: string) =>
  z
    .number({ error: `${label}을(를) 숫자로 입력하세요` })
    .int(`${label}은(는) 정수로 입력하세요`)
    .min(0, `${label}은(는) 0 이상이어야 합니다`)
    .max(Number.MAX_SAFE_INTEGER, "값이 너무 큽니다");

export const exitSchema = z.object({
  company_id: z.uuid("회수할 기업을 선택하세요"),
  exit_type: z.enum(EXIT_TYPES, { error: "회수 형태를 선택하세요" }),
  exit_date: z.string({ error: "회수일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "회수일은 YYYY-MM-DD 형식입니다"),
  proceeds_amount: amount("회수 금액"),
  // BR-EXIT-03: 전량 회수면 남은 원금 전액을 서버가 채운다. 일부 회수면 직접 입력
  full_exit: z.boolean().default(false),
  cost_basis_amount: amount("회수 원금").nullish().transform((v) => v ?? null),
  memo: z.string().trim().max(500).nullish().transform((v) => v || null),
});

export type ExitInput = z.infer<typeof exitSchema>;

import { z } from "zod";

// 조합원 명부 확정·취소 API 요청 형식 (05 API 설계 3-4)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const amount = (label: string) =>
  z
    .number({ error: `${label}을(를) 입력하세요` })
    .int(`${label}은(는) 원 단위 정수로 입력하세요`)
    .positive(`${label}은(는) 0보다 커야 합니다`)
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다");

export const confirmRosterSchema = z.object({
  confirmed_date: date("명부 확정일"),
  gp_commitment_amount: amount("GP 약정액"), // BR-MEM-02: GP 출자 필수
  members: z
    .array(
      z.object({
        proposal_id: z.uuid("출자 제안 ID 형식이 올바르지 않습니다"),
        commitment_amount: amount("약정액"),
      }),
    )
    .min(1, "LP 조합원을 1명 이상 포함하세요"),
});

export const cancelRosterSchema = z.object({
  reason: z.string({ error: "취소 사유를 입력하세요" }).trim().min(1, "취소 사유를 입력하세요").max(500, "500자 이하로 입력하세요"),
});

export type ConfirmRosterInput = z.infer<typeof confirmRosterSchema>;

import { z } from "zod";
import { FUND_STATUSES } from "@/lib/labels";

// 출자 제안·조합 상태 이동 API 요청 형식 (05 API 설계 3-3, 3-4)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const amount = (label: string) =>
  z
    .number({ error: `${label}을(를) 입력하세요` })
    .int(`${label}은(는) 원 단위 정수로 입력하세요`)
    .positive(`${label}은(는) 0보다 커야 합니다`)
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다");

const memo = z
  .string()
  .trim()
  .max(1000, "메모는 1000자 이하로 입력하세요")
  .nullish()
  .transform((v) => (v ? v : null));

export const createProposalSchema = z.object({
  lp_id: z.uuid("출자자를 선택하세요"),
  proposed_amount: amount("제안 금액").nullish().transform((v) => v ?? null),
  proposed_date: date("제안일"),
  memo,
});

// 금액·메모 수정. 확약 금액은 확약 상태에서만 고칠 수 있다 (BR-PROP-01)
export const updateProposalSchema = z.object({
  proposed_amount: amount("제안 금액").nullish().transform((v) => v ?? null),
  loc_amount: amount("확약 금액").nullish().transform((v) => v ?? null),
  memo,
});

export const proposalTransitionSchema = z.object({
  to_status: z.enum(["reviewing", "committed", "declined"], { error: "이동할 단계를 선택하세요" }),
  loc_amount: amount("확약 금액").nullish().transform((v) => v ?? null),
  decided_date: date("결정일").nullish().transform((v) => v ?? null),
});

export const fundTransitionSchema = z.object({
  to_status: z.enum(FUND_STATUSES, { error: "이동할 상태를 선택하세요" }),
});

// LP 시스템의 출자 제안 응답 (LP 연동 API, D45). 확약이면 확약 금액 필수 (BR-PROP-02)
export const lpProposalResponseSchema = z
  .object({
    decision: z.enum(["reviewing", "committed", "declined"], { error: "decision 은 reviewing / committed / declined 중 하나입니다" }),
    loc_amount: amount("확약 금액").nullish().transform((v) => v ?? null),
    decided_date: date("결정일").nullish().transform((v) => v ?? null),
    // 확약과 함께 오는 LP 선정 조건 (D47, LP L55). 예전 LP는 보내지 않는다
    terms: z
      .object({
        formation_deadline: date("결성 기한"),
        max_commitment_ratio: z.number().gt(0).max(1).nullish().transform((v) => v ?? null),
        min_fund_size_amount: z.number().int().positive().nullish().transform((v) => v ?? null),
        key_person_condition: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
        program_name: z.string().trim().max(200).nullish().transform((v) => (v ? v : null)),
      })
      .nullish()
      .transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "committed" && v.terms) ctx.addIssue({ code: "custom", path: ["terms"], message: "선정 조건은 확약할 때만 보냅니다" });
    if (v.decision === "committed" && v.loc_amount === null) ctx.addIssue({ code: "custom", path: ["loc_amount"], message: "확약하려면 확약 금액을 입력하세요" });
    if (v.decision !== "committed" && v.loc_amount !== null) ctx.addIssue({ code: "custom", path: ["loc_amount"], message: "확약 금액은 확약할 때만 보냅니다" });
  });

export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type UpdateProposalInput = z.infer<typeof updateProposalSchema>;
export type ProposalTransitionInput = z.infer<typeof proposalTransitionSchema>;

// LP ERP 출자사업 공고 지원 (D47). 기획 중 · 모집 중 조합으로 부문 하나에 지원한다
export const lpCallApplySchema = z.object({
  fund_id: z.uuid("조합을 선택하세요"),
  track_id: z.uuid("모집 부문을 선택하세요"),
  proposed_amount: amount("요청 출자액"),
  memo,
});

import { z } from "zod";

// 기업·딜 API 요청 형식 (05 API 설계 3-2, 3-7)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이하로 입력하세요`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalAmount = (label: string) =>
  z
    .number({ error: `${label}을(를) 숫자로 입력하세요` })
    .int(`${label}은(는) 원 단위 정수로 입력하세요`)
    .positive(`${label}은(는) 0보다 커야 합니다`)
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다")
    .nullish()
    .transform((v) => v ?? null);

const optionalUuid = z.uuid("ID 형식이 올바르지 않습니다").nullish().transform((v) => v ?? null);

// 사업자등록번호: 숫자 10자리. "123-45-67890" 형태로 저장 (출자자와 같은 규칙)
const registrationNo = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/[^0-9]/g, "") : null))
  .refine((v) => v === null || v.length === 10, "사업자등록번호는 숫자 10자리입니다")
  .transform((v) => (v ? `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}` : null));

export const companySchema = z.object({
  name: z.string({ error: "기업명을 입력하세요" }).trim().min(1, "기업명을 입력하세요").max(100, "100자 이하로 입력하세요"),
  registration_no: registrationNo,
  sector: optionalText(50),
  ceo_name: optionalText(50),
  founded_date: date("설립일").nullish().transform((v) => v ?? null),
});

export const companyListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const createDealSchema = z.object({
  company_id: z.uuid("기업을 선택하세요"),
  target_fund_id: optionalUuid,
  expected_amount: optionalAmount("예상 투자 금액"),
  owner_id: z.uuid("담당자를 선택하세요"),
  sourced_date: date("발굴일"),
});

// 단계 외 정보 수정 (종료 전만, BR-DEAL-02). 기업은 바꾸지 않는다
export const updateDealSchema = createDealSchema.omit({ company_id: true });

export const dealTransitionSchema = z.object({
  to_stage: z.enum(["reviewing", "ic", "approved", "dropped"], { error: "이동할 단계를 선택하세요" }),
  drop_reason: optionalText(500), // BR-DEAL-03
  target_fund_id: optionalUuid, // 투자 확정 때 함께 정할 수 있다 (BR-DEAL-04)
  expected_amount: optionalAmount("예상 투자 금액"),
});

export const dealNoteSchema = z.object({
  content: z.string({ error: "메모를 입력하세요" }).trim().min(1, "메모를 입력하세요").max(5000, "5000자 이하로 입력하세요"),
});

export type CompanyInput = z.infer<typeof companySchema>;
export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type DealTransitionInput = z.infer<typeof dealTransitionSchema>;

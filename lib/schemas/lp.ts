import { z } from "zod";
import { LP_TYPES } from "@/lib/labels";

// 출자자 API 요청 형식 (05 API 설계 3-2)

// 빈 문자열은 "입력 안 함(null)"으로 바꾼다
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v ? v : null));

// 사업자등록번호: 숫자 10자리. 하이픈 유무와 상관없이 받아서 "123-45-67890" 형태로 저장한다
const registrationNo = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/[^0-9]/g, "") : null))
  .refine((v) => v === null || v.length === 10, "사업자등록번호는 숫자 10자리입니다")
  .transform((v) => (v ? `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}` : null));

export const lpSchema = z
  .object({
    name: z.string({ error: "출자자명을 입력하세요" }).trim().min(1, "출자자명을 입력하세요").max(100, "출자자명은 100자 이하로 입력하세요"),
    lp_type: z.enum(LP_TYPES, { error: "출자자 유형을 선택하세요" }),
    registration_no: registrationNo,
    contact_name: optionalText(50, "담당자명은 50자 이하로 입력하세요"),
    contact_email: optionalText(100, "이메일이 너무 깁니다").refine(
      (v) => v === null || z.email().safeParse(v).success,
      "이메일 형식이 올바르지 않습니다",
    ),
    contact_phone: optionalText(30, "전화번호가 너무 깁니다").refine(
      (v) => v === null || /^[0-9+\-() ]+$/.test(v),
      "전화번호는 숫자와 - 만 입력하세요",
    ),
    memo: optionalText(1000, "메모는 1000자 이하로 입력하세요"),
  })
  // 개인 출자자는 사업자등록번호가 없다. 주민등록번호 같은 개인 식별번호는 저장하지 않는다 (BR-LP-02)
  .refine((v) => v.lp_type !== "individual" || v.registration_no === null, {
    message: "개인 출자자는 사업자등록번호를 입력하지 않습니다",
    path: ["registration_no"],
  });

export type LpInput = z.infer<typeof lpSchema>;

export const lpListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  lp_type: z.enum(LP_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export type LpListQuery = z.infer<typeof lpListQuerySchema>;

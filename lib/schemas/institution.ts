import { z } from "zod";
import { INSTITUTION_TYPES } from "@/lib/labels";

// 관계 기관·등록 정보 API 요청 형식 (05 API 설계 3-3)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const optionalText = (max: number, message = `${max}자 이하로 입력하세요`) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v ? v : null));

export const institutionSchema = z.object({
  institution_type: z.enum(INSTITUTION_TYPES, { error: "기관 종류를 선택하세요" }),
  name: z.string({ error: "기관명을 입력하세요" }).trim().min(1, "기관명을 입력하세요").max(100, "100자 이하로 입력하세요"),
  contact_name: optionalText(50),
  contact_email: optionalText(100).refine((v) => v === null || z.email().safeParse(v).success, "이메일 형식이 올바르지 않습니다"),
  contact_phone: optionalText(30).refine((v) => v === null || /^[0-9+\-() ]+$/.test(v), "전화번호는 숫자와 - 만 입력하세요"),
});

// 등록 신청일은 필수, 완료일은 등록이 끝나면 입력 (BR-FUND-03)
export const registrationSchema = z
  .object({
    registration_applied_date: date("등록 신청일"),
    registration_completed_date: date("등록 완료일").nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.registration_completed_date === null || v.registration_completed_date >= v.registration_applied_date, {
    message: "등록 완료일은 신청일 이후여야 합니다",
    path: ["registration_completed_date"],
  });

export type InstitutionInput = z.infer<typeof institutionSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;

import { z } from "zod";

// 구성원 API 요청 형식

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이하로 입력하세요`)
    .nullish()
    .transform((v) => (v ? v : null));

export const staffSchema = z.object({
  employee_no: z.string({ error: "사번을 입력하세요" }).trim().min(1, "사번을 입력하세요").max(20, "사번은 20자 이하입니다"),
  name: z.string({ error: "이름을 입력하세요" }).trim().min(1, "이름을 입력하세요").max(50),
  position: z.string({ error: "직위를 입력하세요" }).trim().min(1, "직위를 입력하세요").max(50),
  department: optionalText(50),
  email: optionalText(100)
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "이메일 형식이 올바르지 않습니다"),
  phone: optionalText(30).refine((v) => v === null || /^[0-9+\-() ]+$/.test(v), "전화번호는 숫자와 - 만 입력하세요"),
  hired_date: date("입사일"),
});

export const createStaffSchema = staffSchema.extend({
  create_account: z.boolean().default(false), // 등록하면서 로그인 계정도 만들지
});

export const leaveSchema = z.object({ left_date: date("퇴사일") });

export type StaffInput = z.infer<typeof staffSchema>;

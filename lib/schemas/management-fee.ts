import { z } from "zod";

// 관리보수 API 요청 형식 (05 API 설계 3-7). 분기 단위로 청구한다 (BR-FEE-01)

export const feePeriodSchema = z.object({
  year: z.number({ error: "연도를 입력하세요" }).int().min(2000, "연도를 확인하세요").max(2100, "연도를 확인하세요"),
  quarter: z.number({ error: "분기를 선택하세요" }).int().min(1, "1~4분기 중에서 고르세요").max(4, "1~4분기 중에서 고르세요"),
});

export const chargeFeeSchema = feePeriodSchema.extend({
  charged_date: z.string({ error: "청구일을 입력하세요" }).regex(/^\d{4}-\d{2}-\d{2}$/, "청구일은 YYYY-MM-DD 형식입니다"),
});

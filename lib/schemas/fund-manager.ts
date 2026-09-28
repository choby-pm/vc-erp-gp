import { z } from "zod";
import { MANAGER_ROLES } from "@/lib/labels";

// 조합 운용 인력 API 요청 형식 (D32)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const optionalUuid = z.uuid("ID 형식이 올바르지 않습니다").nullish().transform((v) => v ?? null);

// 선임. replaces_id 를 주면 그 운용 인력을 선임일 자로 해임하고 새로 선임한다 (교체)
export const appointManagerSchema = z.object({
  staff_id: z.uuid("구성원을 선택하세요"),
  role: z.enum(MANAGER_ROLES, { error: "역할을 선택하세요" }),
  start_date: date("선임일"),
  replaces_id: optionalUuid,
  agenda_id: optionalUuid, // 결성 이후에만 필요: 가결된 운용 인력 교체 안건 (BR-MGR-04)
});

export const endManagerSchema = z.object({
  end_date: date("해임일"),
  agenda_id: optionalUuid,
});

export type AppointManagerInput = z.infer<typeof appointManagerSchema>;
export type EndManagerInput = z.infer<typeof endManagerSchema>;

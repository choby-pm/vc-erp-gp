import { z } from "zod";
import { AGENDA_TYPES, MEETING_TYPES, VOTE_CHOICES } from "@/lib/labels";

// 조합원 총회 API 요청 형식 (05 API 설계 3-9)

const date = (label: string) =>
  z.string({ error: `${label}을(를) 입력하세요` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은(는) YYYY-MM-DD 형식입니다`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이하로 입력하세요`)
    .nullish()
    .transform((v) => (v ? v : null));

export const agendaSchema = z.object({
  agenda_type: z.enum(AGENDA_TYPES, { error: "안건 유형을 선택하세요" }),
  title: z.string({ error: "안건 제목을 입력하세요" }).trim().min(1, "안건 제목을 입력하세요").max(200, "200자 이하로 입력하세요"),
  description: optionalText(2000),
});

export const createMeetingSchema = z.object({
  meeting_type: z.enum(MEETING_TYPES, { error: "총회 유형을 선택하세요" }),
  meeting_date: date("총회일"),
  location: optionalText(200),
  agendas: z.array(agendaSchema).default([]),
});

export const updateMeetingSchema = z.object({
  meeting_date: date("총회일"),
  location: optionalText(200),
});

export const voteSchema = z.object({
  choice: z.enum(VOTE_CHOICES, { error: "찬성·반대·기권 중에서 고르세요" }),
});

// LP 연동 API: 안건별 찬반을 한 번에 제출 (BR-VOTE-07)
export const lpVotesSchema = z.object({
  votes: z
    .array(z.object({ agenda_id: z.uuid({ error: "안건 ID가 올바르지 않습니다" }), choice: voteSchema.shape.choice }), { error: "votes 배열을 보내세요" })
    .min(1, "안건을 하나 이상 투표하세요")
    .refine((vs) => new Set(vs.map((v) => v.agenda_id)).size === vs.length, "같은 안건을 두 번 보낼 수 없습니다"),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type AgendaInput = z.infer<typeof agendaSchema>;

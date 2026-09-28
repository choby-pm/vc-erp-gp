import { z } from "zod";

// 일반 공지 작성 API 요청 형식 (05 API 설계 3-13)
export const noticeSchema = z.object({
  title: z.string({ error: "제목을 입력하세요" }).trim().min(1, "제목을 입력하세요").max(200, "제목은 200자 이내로 입력하세요"),
  body: z.string({ error: "내용을 입력하세요" }).trim().min(1, "내용을 입력하세요").max(5000, "내용은 5000자 이내로 입력하세요"),
  // 비우면 LP 조합원 전원
  lp_ids: z.array(z.uuid("수신자를 확인하세요")).default([]),
});

export type NoticeInput = z.infer<typeof noticeSchema>;

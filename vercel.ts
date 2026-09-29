import type { VercelConfig } from "@vercel/config/v1";

// Vercel 프로젝트 설정 (D41)
// · crons: LP 시스템 이벤트 전송. 무료(Hobby) 요금제는 하루 1회까지라 매일 00:00 UTC (= 오전 9시 KST).
//   Pro 로 바꾸면 "*/5 * * * *" 처럼 더 자주 돌려 재시도 간격(1분 → 5분 → 30분 …)을 살릴 수 있다.
//   바꿀 때는 lib/services/integration.ts 의 DISPATCH_SCHEDULE_LABEL 도 함께 고친다
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [{ path: "/api/cron/dispatch-events", schedule: "0 0 * * *" }],
};

import type { sql } from "@/lib/db";
import { dispatchSoon } from "@/lib/services/integration";

// LP 시스템 연동 이벤트 (아웃박스, D12)
// 데이터를 바꾸는 트랜잭션 안에서 호출해야 한다 (BR-EVT-01). 요청이 끝나면 바로 LP 시스템에 전송하고(D46), 실패한 것은 주기 작업이 다시 보낸다.
// (트랜잭션이 되돌려져도 전송 작업은 대기 중인 이벤트만 보내므로 문제없다)
// payload 에는 🔴 비공개 데이터(메모, 내부 문서 ID 외 GP 전용 정보)를 넣지 않는다 (BR-EVT-05)

export type EventType =
  | "fund.status_changed"
  | "fund.updated" // 등록 정보·관계 기관 변경 (🔵 조합 단위 공개 데이터)
  | "fund.terms_updated" // 규약 새 버전
  | "notice.sent"
  | "member.joined"
  | "ledger.entry_created"
  | "meeting.result_finalized";

export async function recordEvent(
  tx: typeof sql,
  event: {
    event_type: EventType;
    aggregate_type: string;
    aggregate_id: string;
    lp_id: string | null; // 전체 대상이면 null
    fund_id: string;
    data: Record<string, unknown>;
  },
) {
  const payload = { fund_id: event.fund_id, ...event.data };
  await tx`
    insert into integration_events (event_type, aggregate_type, aggregate_id, lp_id, payload)
    values (${event.event_type}, ${event.aggregate_type}, ${event.aggregate_id}, ${event.lp_id}, ${tx.json(payload as never)})
  `;
  dispatchSoon();
}

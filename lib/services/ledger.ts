import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { journalForContribution, journalForDistribution } from "@/lib/services/accounting";
import { recordEvent } from "@/lib/services/events";
import { availableCashOn } from "@/lib/services/finance";

// 원장 조회 (05 API 설계 3-5). 원장은 추가만 가능하고, 정정은 취소 행(음수)으로 남는다 (BR-LED-01, 02)

export const LEDGER_ENTRY_TYPES = ["commitment", "contribution", "distribution"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_TYPE_LABEL: Record<LedgerEntryType, string> = {
  commitment: "약정",
  contribution: "납입",
  distribution: "분배",
};

export const LEDGER_SOURCE_LABEL: Record<string, string> = {
  formation: "조합원 명부 확정",
  capital_call_item: "캐피탈콜 납입",
  distribution_item: "분배 지급",
  terms_amendment: "규약 변경 (약정 증액)",
};

export type LedgerEntry = {
  id: string;
  member_id: string;
  member_type: "gp" | "lp";
  member_name: string; // LP 이름, GP는 "GP"
  entry_type: LedgerEntryType;
  amount: number;
  entry_date: string;
  source_type: string;
  source_id: string;
  reversal_of_id: string | null;
  reversed: boolean; // 이 행을 취소한 행이 있는지
  memo: string | null;
  created_at: Date;
};

// 원장 행 추가 + 해당 LP에게 알릴 연동 이벤트를 같은 트랜잭션에서 (BR-LED-03, 04).
// GP 조합원은 알릴 LP가 없어 이벤트를 만들지 않는다
export async function addLedgerEntry(
  tx: typeof sql,
  entry: {
    fund_id: string;
    member_id: string;
    lp_id: string | null;
    entry_type: LedgerEntryType;
    amount: number;
    entry_date: string;
    source_type: "formation" | "capital_call_item" | "distribution_item" | "terms_amendment";
    source_id: string;
    reversal_of_id?: string;
    memo?: string | null;
    created_by: string;
  },
  options: { journal?: boolean } = {}, // 분배 지급은 분배 문서 단위로 한 번에 분개하므로 false (D37)
) {
  const { lp_id, ...row } = entry;
  const [created] = await tx<{ id: string }[]>`
    insert into ledger_entries ${tx({ reversal_of_id: null, memo: null, ...row })}
    returning id
  `;
  if (lp_id) {
    await recordEvent(tx, {
      event_type: "ledger.entry_created",
      aggregate_type: "ledger_entry",
      aggregate_id: created.id,
      lp_id,
      fund_id: entry.fund_id,
      data: {
        entry_id: created.id,
        entry_type: entry.entry_type,
        amount: entry.amount,
        entry_date: entry.entry_date,
        source_type: entry.source_type, // 내부 문서 ID(source_id)와 메모는 보내지 않는다 (BR-EVT-05)
        reversal_of_id: entry.reversal_of_id ?? null,
      },
    });
  }
  // 회계 (D35): 돈이 실제로 움직인 납입·분배는 같은 트랜잭션에서 분개한다. 약정은 재무상태표 밖(주석)이라 분개하지 않는다
  if (entry.entry_type !== "commitment" && options.journal !== false) {
    const [m] = await tx<{ name: string }[]>`
      select coalesce(lp.name, 'GP') as name from fund_members fm left join limited_partners lp on lp.id = fm.lp_id where fm.id = ${entry.member_id}
    `;
    const journal = { fund_id: entry.fund_id, ledger_id: created.id, amount: entry.amount, entry_date: entry.entry_date, member_name: m.name, created_by: entry.created_by };
    if (entry.entry_type === "contribution") await journalForContribution(tx, journal);
    else await journalForDistribution(tx, journal);
  }
  return created.id;
}

// 원장 행 취소 (BR-LED-02): 금액만 반대인 취소 행을 추가한다. 원래 행은 그대로 남는다.
// 지금은 납입(contribution)만 여기서 취소한다. 약정은 명부 취소(BR-MEM-05), 분배는 분배 문서(R6)에서 다룬다
export async function reverseLedgerEntry(fundId: string, entryId: string, memo: string, userId: string) {
  assertUuid(fundId, "조합을");
  assertUuid(entryId, "원장 기록을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx`select 1 from funds where id = ${fundId} for update`; // BR-COM-02
    if (!fund) throw notFound("조합을");
    const [entry] = await tx<{ id: string; member_id: string; lp_id: string | null; entry_type: LedgerEntryType; amount: number; source_type: "capital_call_item"; source_id: string; reversal_of_id: string | null }[]>`
      select e.id, e.member_id, m.lp_id, e.entry_type, e.amount, e.source_type, e.source_id, e.reversal_of_id
      from ledger_entries e join fund_members m on m.id = e.member_id
      where e.id = ${entryId} and e.fund_id = ${fundId}
    `;
    if (!entry) throw notFound("원장 기록을");
    if (entry.reversal_of_id) throw new AppError(409, "REVERSAL_NOT_ALLOWED", "취소 기록은 다시 취소할 수 없습니다", "BR-LED-02");
    if (entry.entry_type !== "contribution") {
      throw new AppError(409, "REVERSAL_NOT_ALLOWED", "약정은 명부 취소로, 분배는 분배 문서에서 정정합니다", "BR-LED-02");
    }
    const [done] = await tx`select 1 from ledger_entries where reversal_of_id = ${entryId}`;
    if (done) throw new AppError(409, "ALREADY_REVERSED", "이미 취소된 기록입니다", "BR-LED-02");

    // 납입을 취소하면 현금이 줄어든다. 이미 투자·관리보수로 쓴 돈이면 취소할 수 없다 (취소 행은 오늘 날짜, BR-FIN-02)
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const available = await availableCashOn(t, fundId, today);
    if (available < entry.amount) {
      throw new AppError(422, "INSUFFICIENT_CASH", "취소하면 현금 잔액이 음수가 됩니다. 이미 사용한 납입금입니다", "BR-LED-02", { available_amount: available });
    }

    return addLedgerEntry(t, {
      fund_id: fundId,
      member_id: entry.member_id,
      lp_id: entry.lp_id,
      entry_type: entry.entry_type,
      amount: -entry.amount,
      entry_date: today,
      source_type: entry.source_type,
      source_id: entry.source_id,
      reversal_of_id: entry.id,
      memo,
      created_by: userId,
    });
  });
}

export async function listLedger(fundId: string, filter: { member_id?: string | null; entry_type?: LedgerEntryType | null } = {}) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql`select 1 from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  const memberId = filter.member_id ?? null;
  if (memberId) assertUuid(memberId, "조합원을");

  return sql<LedgerEntry[]>`
    select e.id, e.member_id, m.member_type, coalesce(lp.name, 'GP') as member_name,
           e.entry_type, e.amount, e.entry_date, e.source_type, e.source_id, e.reversal_of_id,
           exists (select 1 from ledger_entries r where r.reversal_of_id = e.id) as reversed,
           e.memo, e.created_at
    from ledger_entries e
    join fund_members m on m.id = e.member_id
    left join limited_partners lp on lp.id = m.lp_id
    where e.fund_id = ${fundId}
      and (${memberId}::uuid is null or e.member_id = ${memberId}::uuid)
      and (${filter.entry_type ?? null}::text is null or e.entry_type = ${filter.entry_type ?? null})
    order by e.created_at desc, e.id
  `;
}

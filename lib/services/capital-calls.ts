import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import type { CallStatus, FundStatus, PaymentStatus } from "@/lib/labels";
import type { CapitalCallInput, PaymentInput } from "@/lib/schemas/capital-call";
import { recordEvent } from "@/lib/services/events";
import { addLedgerEntry } from "@/lib/services/ledger";

// 출자 요청(캐피탈콜) 서비스 (BR-CALL-01~12)
// · 초안 생성 → 발송(잠금 + LP별 통지) → 조합원별 납입 기록(원장) → 마감
// · 요청은 청구서일 뿐이라 원장에 넣지 않는다. 실제 납입만 contribution 원장 행이 된다 (D8)
// · 조합원별 요청액 = 전체 요청액 × 약정 비율, 원 미만 버림. 나머지는 약정액이 가장 큰 조합원에게 (D13)


export type CallPreviewItem = {
  member_id: string;
  member_name: string;
  member_type: "gp" | "lp";
  lp_id: string | null;
  commitment_amount: number;
  ownership_ratio: number;
  unfunded_before: number;
  call_amount: number;
  unfunded_after: number;
};

export type CallPreview = {
  total_call_amount: number;
  fund_unfunded_amount: number;
  is_initial: boolean;
  items: CallPreviewItem[];
  remainder: { amount: number; assigned_member_id: string | null };
};

export type CapitalCallListItem = {
  id: string;
  call_no: number;
  is_initial: boolean;
  total_call_amount: number;
  call_date: string;
  due_date: string;
  purpose: string | null;
  status: CallStatus;
  paid_amount: number;
  paid_ratio: number;
  unpaid_member_count: number;
};

export type CapitalCallDetail = CapitalCallListItem & {
  items: {
    id: string;
    member_id: string;
    member_name: string;
    member_type: "gp" | "lp";
    ownership_ratio: number;
    call_amount: number;
    paid_amount: number;
    payment_status: PaymentStatus | null; // 초안이면 null
  }[];
};

// ─── 계산 ──────────────────────────────────────────────────────────────────

type Member = { member_id: string; member_name: string; member_type: "gp" | "lp"; lp_id: string | null; commitment_amount: number; ownership_ratio: number; unfunded_amount: number };

// 발송된(issued·closed) 요청만 잔여 약정에서 뺀다. 초안은 아직 요청이 아니다 (v_member_balances)
async function loadMembers(tx: typeof sql, fundId: string) {
  return tx<Member[]>`
    select b.member_id, coalesce(lp.name, 'GP') as member_name, b.member_type, b.lp_id, b.commitment_amount,
           coalesce(b.ownership_ratio, 0)::float8 as ownership_ratio, b.unfunded_amount
    from v_member_balances b
    join fund_members m on m.id = b.member_id
    left join limited_partners lp on lp.id = b.lp_id
    where b.fund_id = ${fundId} and b.commitment_amount > 0
    order by b.commitment_amount desc, m.joined_date, m.created_at, b.member_type = 'lp', m.id
  `; // 동률이면 먼저 가입한 조합원. 같은 명부로 함께 가입했으면 GP 먼저 (결과가 항상 같도록 마지막은 ID 순)
}

// BR-CALL-03~05. 원 단위 정확도를 위해 BigInt 로 계산한다
function allocate(members: Member[], input: CapitalCallInput): CallPreview & { is_initial: boolean } {
  const fundUnfunded = members.reduce((s, m) => s + m.unfunded_amount, 0);
  const items: CallPreviewItem[] = members.map((m) => ({
    member_id: m.member_id,
    member_name: m.member_name,
    member_type: m.member_type,
    lp_id: m.lp_id,
    commitment_amount: m.commitment_amount,
    ownership_ratio: m.ownership_ratio,
    unfunded_before: m.unfunded_amount,
    call_amount: 0,
    unfunded_after: m.unfunded_amount,
  }));
  let remainder = { amount: 0, assigned_member_id: null as string | null };

  if (input.call_all_unfunded) {
    // 마지막 캐피탈콜: 비율 계산 대신 조합원별 잔여 약정 전액
    for (const it of items) it.call_amount = it.unfunded_before;
  } else {
    const total = BigInt(input.total_call_amount!);
    // BR-CALL-02: 전체 요청액 ≤ 조합 잔여 약정
    if (input.total_call_amount! > fundUnfunded) {
      throw new AppError(422, "CALL_EXCEEDS_UNFUNDED", `요청액이 조합의 잔여 약정액(${formatKRW(fundUnfunded)})을 넘습니다`, "BR-CALL-02", {
        fund_unfunded_amount: fundUnfunded,
        fields: { total_call_amount: `잔여 약정 ${formatKRWFull(fundUnfunded)} 이하로 입력하세요` },
      });
    }
    const totalCommitment = BigInt(members.reduce((s, m) => s + m.commitment_amount, 0));
    let sum = BigInt(0);
    for (const it of items) {
      const share = (total * BigInt(it.commitment_amount)) / totalCommitment; // 원 미만 버림
      it.call_amount = Number(share);
      sum += share;
    }
    // BR-CALL-04: 나머지는 약정액이 가장 큰 조합원 (동률이면 먼저 가입). members 가 그 순서로 정렬되어 있다
    const left = Number(total - sum);
    if (left > 0 && items.length > 0) {
      items[0].call_amount += left;
      remainder = { amount: left, assigned_member_id: items[0].member_id };
    }
    // BR-CALL-05: 조합원별 잔여 약정 초과 금지
    const over = items.find((it) => it.call_amount > it.unfunded_before);
    if (over) {
      throw new AppError(422, "CALL_EXCEEDS_UNFUNDED", `${over.member_name}의 요청액이 잔여 약정액(${formatKRW(over.unfunded_before)})을 넘습니다. ‘잔여 약정 전액 요청’을 쓰세요`, "BR-CALL-05", {
        member_id: over.member_id,
      });
    }
  }
  for (const it of items) it.unfunded_after = it.unfunded_before - it.call_amount;
  const totalCall = items.reduce((s, it) => s + it.call_amount, 0);
  if (totalCall <= 0) throw new AppError(422, "CALL_EXCEEDS_UNFUNDED", "요청할 잔여 약정액이 없습니다", "BR-CALL-02");
  return { total_call_amount: totalCall, fund_unfunded_amount: fundUnfunded, is_initial: false, items, remainder };
}

// BR-CALL-01: 결성·운용 중 가능. 모집 중에는 명부 확정 후 최초 납입 1회만
async function assertCallAllowed(tx: typeof sql, fundId: string, status: FundStatus, exceptCallId?: string) {
  if (status === "formed" || status === "operating") return { is_initial: false };
  if (status !== "fundraising") throw statusNotAllowed("BR-CALL-01", "현재 조합 상태에서는 캐피탈콜을 할 수 없습니다");
  const [roster] = await tx`select 1 from fund_rosters where fund_id = ${fundId} and cancelled_at is null`;
  if (!roster) throw statusNotAllowed("BR-CALL-01", "최초 납입은 조합원 명부를 확정한 뒤에 요청할 수 있습니다");
  const [other] = await tx`select 1 from capital_calls where fund_id = ${fundId} and id <> ${exceptCallId ?? "00000000-0000-0000-0000-000000000000"}`;
  if (other) throw statusNotAllowed("BR-CALL-01", "결성 전에는 최초 납입 1회만 요청할 수 있습니다");
  return { is_initial: true };
}

async function loadFund(tx: typeof sql, fundId: string, lock: boolean) {
  assertUuid(fundId, "조합을");
  const [fund] = lock
    ? await tx<{ status: FundStatus; name: string }[]>`select status, name from funds where id = ${fundId} for update`
    : await tx<{ status: FundStatus; name: string }[]>`select status, name from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  return fund;
}

export async function previewCapitalCall(fundId: string, input: CapitalCallInput): Promise<CallPreview> {
  const fund = await loadFund(sql, fundId, false);
  const { is_initial } = await assertCallAllowed(sql, fundId, fund.status);
  return { ...allocate(await loadMembers(sql, fundId), input), is_initial };
}

// ─── 조회 ──────────────────────────────────────────────────────────────────

export async function listCapitalCalls(fundId: string) {
  const fund = await loadFund(sql, fundId, false);
  const calls = await sql<CapitalCallListItem[]>`
    select c.id, c.call_no, c.is_initial, c.total_call_amount, c.call_date, c.due_date, c.purpose, c.status,
           coalesce(sum(s.paid_amount), 0)::bigint as paid_amount,
           coalesce(sum(s.paid_amount), 0)::float8 / c.total_call_amount as paid_ratio,
           count(*) filter (where s.payment_status in ('pending', 'partial', 'overdue'))::int as unpaid_member_count
    from capital_calls c
    left join v_capital_call_item_status s on s.capital_call_id = c.id
    where c.fund_id = ${fundId}
    group by c.id
    order by c.call_no desc
  `;
  let can_create = true;
  try {
    await assertCallAllowed(sql, fundId, fund.status);
  } catch {
    can_create = false;
  }
  return { fund_status: fund.status, can_create, calls };
}

// 미납 관리: 발송된 모든 요청에서 아직 다 내지 않은 조합원 항목 (기한 초과 먼저)
export type UnpaidItem = {
  capital_call_id: string;
  call_no: number;
  is_initial: boolean;
  due_date: string;
  member_name: string;
  member_type: "gp" | "lp";
  call_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: PaymentStatus;
  overdue_days: number;
};

export async function listUnpaidItems(fundId: string) {
  await loadFund(sql, fundId, false);
  return sql<UnpaidItem[]>`
    select c.id as capital_call_id, c.call_no, c.is_initial, c.due_date, coalesce(lp.name, 'GP') as member_name, m.member_type,
           s.call_amount, s.paid_amount, s.call_amount - s.paid_amount as unpaid_amount, s.payment_status,
           greatest(current_date - c.due_date, 0) as overdue_days
    from v_capital_call_item_status s
    join capital_calls c on c.id = s.capital_call_id
    join fund_members m on m.id = s.member_id
    left join limited_partners lp on lp.id = m.lp_id
    where s.fund_id = ${fundId} and s.payment_status in ('pending', 'partial', 'overdue')
    order by s.payment_status = 'overdue' desc, c.due_date, s.call_amount - s.paid_amount desc
  `;
}

export async function getCapitalCall(fundId: string, callId: string): Promise<CapitalCallDetail> {
  await loadFund(sql, fundId, false);
  assertUuid(callId, "캐피탈콜을");
  const { calls } = await listCapitalCalls(fundId);
  const call = calls.find((c) => c.id === callId);
  if (!call) throw notFound("캐피탈콜을");
  const items = await sql<CapitalCallDetail["items"]>`
    select i.id, i.member_id, coalesce(lp.name, 'GP') as member_name, m.member_type,
           i.ownership_ratio::float8 as ownership_ratio, i.call_amount, s.paid_amount, s.payment_status
    from capital_call_items i
    join v_capital_call_item_status s on s.item_id = i.id
    join fund_members m on m.id = i.member_id
    left join limited_partners lp on lp.id = m.lp_id
    where i.capital_call_id = ${callId}
    order by m.member_type = 'lp', i.call_amount desc
  `;
  return { ...call, items };
}

// ─── 초안 ──────────────────────────────────────────────────────────────────

async function saveItems(tx: typeof sql, callId: string, preview: CallPreview) {
  await tx`delete from capital_call_items where capital_call_id = ${callId}`;
  for (const it of preview.items) {
    await tx`
      insert into capital_call_items (capital_call_id, member_id, ownership_ratio, call_amount)
      values (${callId}, ${it.member_id}, ${it.ownership_ratio.toFixed(6)}, ${it.call_amount})
    `;
  }
}

export async function createCapitalCall(fundId: string, input: CapitalCallInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true);
    const { is_initial } = await assertCallAllowed(t, fundId, fund.status);
    const preview = allocate(await loadMembers(t, fundId), input);
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(call_no), 0) + 1 as next from capital_calls where fund_id = ${fundId}`;
    const [call] = await tx<{ id: string }[]>`
      insert into capital_calls (fund_id, call_no, is_initial, total_call_amount, call_date, due_date, purpose, created_by)
      values (${fundId}, ${next}, ${is_initial}, ${preview.total_call_amount}, ${input.call_date}, ${input.due_date}, ${input.purpose}, ${userId})
      returning id
    `;
    await saveItems(t, call.id, preview);
    return call;
  });
}

async function lockCall(tx: typeof sql, fundId: string, callId: string) {
  assertUuid(callId, "캐피탈콜을");
  const [call] = await tx<{ id: string; call_no: number; status: CallStatus; call_date: string; due_date: string; total_call_amount: number; purpose: string | null; is_initial: boolean }[]>`
    select id, call_no, status, call_date, due_date, total_call_amount, purpose, is_initial from capital_calls
    where id = ${callId} and fund_id = ${fundId} for update
  `;
  if (!call) throw notFound("캐피탈콜을");
  return call;
}

const locked = () => new AppError(409, "DOCUMENT_LOCKED", "발송된 캐피탈콜은 수정하거나 삭제할 수 없습니다", "BR-COM-03");

export async function updateCapitalCall(fundId: string, callId: string, input: CapitalCallInput) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true);
    const call = await lockCall(t, fundId, callId);
    if (call.status !== "draft") throw locked();
    await assertCallAllowed(t, fundId, fund.status, callId);
    const preview = allocate(await loadMembers(t, fundId), input);
    await tx`
      update capital_calls set total_call_amount = ${preview.total_call_amount}, call_date = ${input.call_date},
             due_date = ${input.due_date}, purpose = ${input.purpose}
      where id = ${callId}
    `;
    await saveItems(t, callId, preview);
  });
}

export async function deleteCapitalCall(fundId: string, callId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await loadFund(t, fundId, true);
    const call = await lockCall(t, fundId, callId);
    if (call.status !== "draft") throw locked();
    await tx`delete from capital_call_items where capital_call_id = ${callId}`;
    await tx`delete from capital_calls where id = ${callId}`;
  });
}

// ─── 발송 ──────────────────────────────────────────────────────────────────

// BR-CALL-07: 초안 → 발송. 잔여 약정을 다시 확인하고(그 사이 다른 요청이 발송됐을 수 있음),
// LP 조합원마다 자기 요청액이 담긴 통지를 만든다. 다른 LP의 금액은 보이지 않는다. GP에게는 통지하지 않는다
export async function issueCapitalCall(fundId: string, callId: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true);
    const call = await lockCall(t, fundId, callId);
    if (call.status !== "draft") throw new AppError(409, "DOCUMENT_LOCKED", "이미 발송된 캐피탈콜입니다", "BR-COM-03");
    await assertCallAllowed(t, fundId, fund.status, callId);

    const members = new Map((await loadMembers(t, fundId)).map((m) => [m.member_id, m]));
    const items = await tx<{ id: string; member_id: string; call_amount: number }[]>`
      select id, member_id, call_amount from capital_call_items where capital_call_id = ${callId}
    `;
    for (const it of items) {
      const m = members.get(it.member_id);
      if (!m || it.call_amount > m.unfunded_amount) {
        throw new AppError(422, "CALL_EXCEEDS_UNFUNDED", `${m?.member_name ?? "조합원"}의 요청액이 잔여 약정액을 넘습니다. 초안을 다시 계산하세요`, "BR-CALL-05");
      }
    }

    await tx`update capital_calls set status = 'issued' where id = ${callId}`;

    const title = `${fund.name} ${call.is_initial ? "최초 납입" : `제${call.call_no}차 출자`} 요청`;
    for (const it of items) {
      const m = members.get(it.member_id)!;
      if (!m.lp_id || it.call_amount === 0) continue;
      const body = [
        `${m.member_name} 귀중`,
        "",
        `${fund.name}의 ${call.is_initial ? "최초 납입" : `제${call.call_no}차 출자`}을 아래와 같이 요청드립니다.`,
        "",
        `· 요청 금액: ${formatKRWFull(it.call_amount)}`,
        `· 요청일: ${formatDate(call.call_date)}`,
        `· 납입 기한: ${formatDate(call.due_date)}`,
        ...(call.purpose ? [`· 용도: ${call.purpose}`] : []),
        `· 요청 후 잔여 약정액: ${formatKRWFull(m.unfunded_amount - it.call_amount)}`,
      ].join("\n");
      const [notice] = await tx<{ id: string; sent_at: Date }[]>`
        insert into notices (fund_id, notice_type, title, body, source_type, source_id, status, sent_at, created_by)
        values (${fundId}, 'capital_call', ${title}, ${body}, 'capital_call_item', ${it.id}, 'sent', now(), ${userId})
        returning id, sent_at
      `;
      await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${m.lp_id})`;
      await recordEvent(t, {
        event_type: "notice.sent",
        aggregate_type: "notice",
        aggregate_id: notice.id,
        lp_id: m.lp_id,
        fund_id: fundId,
        data: {
          notice_id: notice.id,
          notice_type: "capital_call",
          title,
          sent_at: notice.sent_at,
          capital_call: { call_no: call.call_no, is_initial: call.is_initial, call_amount: it.call_amount, call_date: call.call_date, due_date: call.due_date },
        },
      });
    }
  });
}

// ─── 납입·마감 ─────────────────────────────────────────────────────────────

export async function recordPayment(fundId: string, callId: string, itemId: string, input: PaymentInput, userId: string) {
  assertUuid(itemId, "요청 항목을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await loadFund(t, fundId, true); // BR-COM-02
    const call = await lockCall(t, fundId, callId);
    if (call.status === "draft") throw new AppError(409, "CALL_NOT_ISSUED", "발송한 캐피탈콜에만 납입을 기록할 수 있습니다", "BR-CALL-08");

    const [item] = await tx<{ id: string; member_id: string; lp_id: string | null; call_amount: number; paid_amount: number }[]>`
      select i.id, i.member_id, m.lp_id, i.call_amount, s.paid_amount
      from capital_call_items i
      join fund_members m on m.id = i.member_id
      join v_capital_call_item_status s on s.item_id = i.id
      where i.id = ${itemId} and i.capital_call_id = ${callId}
    `; // 캐피탈콜 행을 이미 잠갔으므로 같은 요청의 납입은 한 번에 하나씩 처리된다
    if (!item) throw notFound("요청 항목을");

    // BR-CALL-09: 누적 납입 ≤ 요청액
    const remaining = item.call_amount - item.paid_amount;
    if (input.paid_amount > remaining) {
      throw new AppError(422, "PAYMENT_EXCEEDS_CALL", `납입액이 남은 요청액(${formatKRWFull(remaining)})을 넘습니다`, "BR-CALL-09", {
        remaining_amount: remaining,
        fields: { paid_amount: `${formatKRWFull(remaining)} 이하로 입력하세요` },
      });
    }
    // BR-CALL-10: 요청일 ≤ 납입일 ≤ 오늘
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (input.paid_date < call.call_date || input.paid_date > today) {
      const message = `납입일은 요청일(${call.call_date})부터 오늘 사이여야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-CALL-10", { fields: { paid_date: message } });
    }

    const entryId = await addLedgerEntry(t, {
      fund_id: fundId,
      member_id: item.member_id,
      lp_id: item.lp_id,
      entry_type: "contribution",
      amount: input.paid_amount,
      entry_date: input.paid_date,
      source_type: "capital_call_item",
      source_id: item.id,
      memo: input.memo,
      created_by: userId,
    });

    // BR-CALL-12: 모든 항목이 완납이면 자동 마감
    const [open] = await tx`
      select 1 from v_capital_call_item_status where capital_call_id = ${callId} and paid_amount < call_amount
    `;
    if (!open && call.status === "issued") await tx`update capital_calls set status = 'closed' where id = ${callId}`;
    return { ledger_entry_id: entryId };
  });
}

export async function closeCapitalCall(fundId: string, callId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await loadFund(t, fundId, true);
    const call = await lockCall(t, fundId, callId);
    if (call.status !== "issued") throw new AppError(409, "DOCUMENT_LOCKED", "발송된 캐피탈콜만 마감할 수 있습니다", "BR-CALL-12");
    await tx`update capital_calls set status = 'closed' where id = ${callId}`;
  });
}

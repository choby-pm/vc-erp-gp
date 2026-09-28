"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW } from "@/lib/format";
import { DEAL_NEXT, DEAL_STAGES, DEAL_STAGE_LABEL, FUND_STATUS_LABEL, type DealStage, type FundStatus } from "@/lib/labels";
import type { DealListItem } from "@/lib/services/deals";

// 딜 칸반 보드: 카드를 끌어 다른 단계 칸에 놓으면 단계를 옮긴다 (BR-DEAL-01)
// · 끄는 동안 옮길 수 있는 칸만 강조한다 (단계 건너뛰기 불가, 투심위 → 검토 되돌리기 가능)
// · 드롭은 사유, 투자 확정은 투자 예정 조합·예상 금액을 입력받는다 (BR-DEAL-03, 04)
// · 투심위는 메모 1건 이상 + 예상 금액이 필요하다. 메모가 없으면 알림, 금액만 없으면 입력받는다 (BR-DEAL-07)
// · 화면은 먼저 옮겨 보여주고(낙관적 갱신), 서버가 거절하면 원래 자리로 되돌린다

type FundOption = { id: string; name: string; status: FundStatus };
type Pending = { deal: DealListItem; to: "dropped" | "approved" | "ic" };

const OPEN: DealStage[] = ["sourcing", "reviewing", "ic"];
const CLOSED_LIMIT = 8;
const daysSince = (d: Date | string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));

export default function DealBoard({ deals: initial, avgDays, funds }: { deals: DealListItem[]; avgDays: Partial<Record<DealStage, number>>; funds: FundOption[] }) {
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [dragging, setDragging] = useState<DealListItem | null>(null);
  const [over, setOver] = useState<DealStage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 서버에서 새 목록이 오면 반영한다 (router.refresh 후)
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setDeals(initial);
  }

  const allowed = (deal: DealListItem | null, to: DealStage) => Boolean(deal && DEAL_NEXT[deal.stage].includes(to));

  // 옮길 수 없는 이유 (알림 창에 보여준다). 옮길 수 있으면 null
  function blockedReason(deal: DealListItem, to: DealStage): string | null {
    if (allowed(deal, to)) return null;
    const next = DEAL_NEXT[deal.stage];
    if (next.length === 0) {
      return `${deal.company_name}은(는) 이미 ${DEAL_STAGE_LABEL[deal.stage]}된 딜이라 옮길 수 없습니다.\n다시 검토하려면 기업 화면에서 새 딜을 등록하세요.`;
    }
    const from = DEAL_STAGES.indexOf(deal.stage);
    const target = DEAL_STAGES.indexOf(to);
    const options = next.map((s) => DEAL_STAGE_LABEL[s]).join(", ");
    if (target < from) {
      return `${DEAL_STAGE_LABEL[deal.stage]}에서 ${DEAL_STAGE_LABEL[to]}(으)로 되돌릴 수 없습니다.\n되돌리기는 투심위 → 검토(보완 요청)만 가능합니다.\n\n지금 옮길 수 있는 단계: ${options}`;
    }
    return `${DEAL_STAGE_LABEL[deal.stage]}에서 ${DEAL_STAGE_LABEL[to]}(으)로 바로 옮길 수 없습니다.\n단계는 하나씩 진행해야 합니다.\n\n지금 옮길 수 있는 단계: ${options}`;
  }

  async function move(deal: DealListItem, to: DealStage, extra: Record<string, unknown> = {}) {
    setBusyId(deal.id);
    const before = deals;
    setDeals((list) => list.map((d) => (d.id === deal.id ? { ...d, stage: to, stage_since: new Date(), ...(extra as Partial<DealListItem>) } : d)));
    const res = await fetch(`/api/v1/deals/${deal.id}/transitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_stage: to, ...extra }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      // 화면 검사를 통과했어도 서버 규칙(조합 상태 등)에 걸리면 원래 자리로 되돌리고 알린다
      setDeals(before);
      window.alert(`${deal.company_name}을(를) 옮기지 못했습니다.\n${json.error?.message ?? ""}`);
      return false;
    }
    router.refresh();
    return true;
  }

  function onDrop(to: DealStage) {
    const deal = dragging;
    setDragging(null);
    setOver(null);
    if (!deal || deal.stage === to) return;
    const reason = blockedReason(deal, to);
    if (reason) {
      window.alert(reason);
      return;
    }
    if (to === "ic") {
      // BR-DEAL-07: 메모는 딜 상세에서 작성해야 하므로 알림으로 안내하고, 금액만 없으면 바로 입력받는다
      const missing = [deal.note_count === 0 && "딜 메모 1건 이상 (딜 상세에서 작성)", !deal.expected_amount && "예상 투자 금액"].filter(Boolean);
      if (deal.note_count === 0) {
        window.alert(`${deal.company_name}을(를) 투심위에 올리려면 다음이 필요합니다.\n\n- ${missing.join("\n- ")}\n\n카드를 눌러 딜 상세에서 메모를 먼저 작성하세요.`);
        return;
      }
      if (!deal.expected_amount) {
        setPending({ deal, to });
        return;
      }
    }
    if (to === "dropped" || to === "approved") setPending({ deal, to });
    else move(deal, to);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">카드를 끌어 다른 단계에 놓으면 단계가 바뀝니다. 끄는 동안 옮길 수 있는 칸은 파랗게, 옮길 수 없는 칸은 빨갛게 표시되고 놓으면 이유를 알려줍니다. (터치 화면에서는 딜 상세에서 옮기세요)</p>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {DEAL_STAGES.map((stage) => {
          const list = deals.filter((d) => d.stage === stage);
          const shown = OPEN.includes(stage) ? list : list.slice(0, CLOSED_LIMIT);
          const canDrop = dragging !== null && allowed(dragging, stage);
          const isSource = dragging?.stage === stage;
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                if (!dragging || isSource) return;
                // 옮길 수 없는 칸에도 놓을 수는 있게 해서, 놓았을 때 왜 안 되는지 알림 창으로 알려준다
                // (dropEffect 를 "none" 으로 두면 브라우저가 drop 이벤트를 보내지 않으므로 항상 "move")
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== stage) setOver(stage);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((s) => (s === stage ? null : s));
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(stage);
              }}
              className={`flex flex-col rounded-2xl border-2 transition-colors ${
                over === stage && canDrop
                  ? "border-indigo-500 bg-indigo-50"
                  : over === stage
                    ? "border-rose-400 bg-rose-50"
                    : canDrop
                    ? "border-dashed border-indigo-300 bg-indigo-50/40"
                    : dragging && !isSource
                      ? "border-transparent bg-slate-100/40 opacity-50"
                      : "border-transparent bg-slate-100/60"
              }`}
            >
              <header className="px-3 pt-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">{DEAL_STAGE_LABEL[stage]}</h2>
                  <span className="text-xs tabular-nums text-slate-500">{list.length}건</span>
                </div>
                {avgDays[stage] !== undefined && <p className="text-[11px] text-slate-500">평균 {avgDays[stage]}일 머묾</p>}
              </header>
              <ul className="min-h-24 flex-1 space-y-2 p-3">
                {shown.length === 0 && (
                  <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">{canDrop ? "여기에 놓기" : "없음"}</li>
                )}
                {shown.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    busy={busyId === d.id}
                    dragging={dragging?.id === d.id}
                    onDragStart={() => setDragging(d)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
                {shown.length < list.length && <li className="text-center text-xs text-slate-500">외 {list.length - shown.length}건</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {pending && (
        <MoveDialog
          pending={pending}
          funds={funds}
          onCancel={() => setPending(null)}
          onConfirm={async (extra) => {
            const ok = await move(pending.deal, pending.to, extra);
            if (ok) setPending(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function DealCard({
  deal: d,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  deal: DealListItem;
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const closed = DEAL_NEXT[d.stage].length === 0;
  const days = daysSince(d.stage_since);
  const stale = !closed && days >= 30;
  return (
    <li>
      <Link
        href={`/deals/${d.id}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", d.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        title={closed ? "종료된 딜은 옮길 수 없습니다 (눌러서 상세 보기)" : "끌어서 단계를 옮기거나, 눌러서 상세를 봅니다"}
        className={`block rounded-xl border bg-white p-3 shadow-sm ${closed ? "border-slate-200 bg-slate-50" : "cursor-grab border-slate-200 hover:border-indigo-300 active:cursor-grabbing"} ${
          dragging ? "opacity-40" : ""
        } ${busy ? "animate-pulse" : ""}`}
      >
        <p className="font-semibold text-slate-900">{d.company_name}</p>
        {d.sector && <p className="text-xs text-slate-500">{d.sector}</p>}
        {(d.target_fund_name || d.expected_amount) && (
          <p className="mt-1.5 text-xs text-slate-600">
            {d.target_fund_name ?? "조합 미정"}
            {d.expected_amount ? ` · ${formatKRW(d.expected_amount)}` : ""}
          </p>
        )}
        {d.drop_reason && <p className="mt-1 line-clamp-2 text-xs text-rose-600">{d.drop_reason}</p>}
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>{d.owner_name}</span>
          <span className={stale ? "font-semibold text-amber-700" : ""}>
            {d.stage === "approved" && d.invested ? "투자 집행됨" : `${days}일째`}
            {d.note_count > 0 && ` · 메모 ${d.note_count}`}
          </span>
        </div>
      </Link>
    </li>
  );
}

// 드롭 사유 / 투자 확정 조건 입력 창
function MoveDialog({
  pending,
  funds,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  funds: FundOption[];
  onCancel: () => void;
  onConfirm: (extra: Record<string, unknown>) => Promise<boolean>;
}) {
  const { deal, to } = pending;
  const [reason, setReason] = useState("");
  const [fundId, setFundId] = useState(deal.target_fund_id ?? "");
  const [amount, setAmount] = useState(deal.expected_amount ? String(deal.expected_amount) : "");
  const [busy, setBusy] = useState(false);
  const drop = to === "dropped";
  const ic = to === "ic";
  const ready = drop ? reason.trim().length > 0 : ic ? Boolean(toAmount(amount)) : Boolean(fundId && toAmount(amount));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await onConfirm(drop ? { drop_reason: reason } : ic ? { expected_amount: toAmount(amount) } : { target_fund_id: fundId, expected_amount: toAmount(amount) });
    if (!ok) setBusy(false);
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">
          {deal.company_name} · {drop ? "드롭" : ic ? "투심위 상정" : "투자 확정"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {drop
            ? "드롭하면 되돌릴 수 없습니다. 다시 검토하려면 새 딜을 만듭니다."
            : ic
              ? "투심위에 올리려면 예상 투자 금액이 필요합니다."
              : "투자 확정 후에는 딜 정보를 바꿀 수 없습니다. 조합이 운용 중이면 투자 집행 탭에서 집행합니다."}
        </p>
        {drop ? (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-600">드롭 사유 (필수)</span>
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 밸류에이션 이견" className={input} />
          </label>
        ) : ic ? (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-600">예상 투자 금액 (필수)</span>
            <AmountInput value={amount} onChange={setAmount} autoFocus />
          </label>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">투자 예정 조합</span>
              <select value={fundId} onChange={(e) => setFundId(e.target.value)} className={input}>
                <option value="">선택하세요</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({FUND_STATUS_LABEL[f.status]})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">예상 투자 금액</span>
              <AmountInput value={amount} onChange={setAmount} />
            </label>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !ready}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${drop ? "bg-rose-600 hover:bg-rose-700" : ic ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {busy ? "처리 중…" : drop ? "드롭" : ic ? "투심위로 옮기기" : "투자 확정"}
          </button>
        </div>
      </form>
    </div>
  );
}

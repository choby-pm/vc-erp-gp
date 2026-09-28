import ExitForm from "@/components/exit-form";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { EXIT_TYPE_LABEL } from "@/lib/labels";
import { listExits } from "@/lib/services/exits";

// 투자·회수 > 회수: 회수 기록 + 회수 내역 (BR-EXIT-01~06)

export default async function ExitsPage(props: PageProps<"/funds/[fundId]/exits">) {
  const { fundId } = await props.params;
  const data = await listExits(fundId);
  const t = data.totals;

  const cards: [string, string, string, string?][] = [
    ["회수 금액 (처분대가)", formatKRW(t.proceeds_amount), `${t.count}건`],
    ["처분 원가", formatKRW(t.cost_basis_amount), "회수한 투자 원금"],
    [t.gain_amount >= 0 ? "투자자산처분이익" : "투자자산처분손실", formatKRW(Math.abs(t.gain_amount)), "처분대가 − 처분 원가", t.gain_amount >= 0 ? "text-emerald-700" : "text-rose-700"],
    ["회수 배수", t.multiple === null ? "-" : `${t.multiple.toFixed(2)}x`, "처분대가 ÷ 처분 원가"],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-4">
        {cards.map(([label, value, note, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`mt-1 text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</dd>
            <p className="text-[11px] text-slate-400">{note}</p>
          </div>
        ))}
      </dl>

      {data.can_record ? (
        <ExitForm fundId={fundId} holdings={data.holdings} />
      ) : (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">회수는 운용·해산 중인 조합에서 기록합니다.</p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">회수 내역 {data.exits.length}건</h2>
        {data.exits.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 회수한 기업이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">회수일</th>
                  <th className="px-3 py-2.5">기업</th>
                  <th className="px-3 py-2.5">형태</th>
                  <th className="px-3 py-2.5 text-right">처분대가</th>
                  <th className="px-3 py-2.5 text-right">처분 원가</th>
                  <th className="px-3 py-2.5 text-right">처분손익</th>
                  <th className="px-6 py-2.5 text-right">배수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.exits.map((x) => (
                  <tr key={x.id}>
                    <td className="px-6 py-2.5 text-slate-600">{formatDate(x.exit_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-slate-900">{x.company_name}</span>
                      {x.memo && <span className="block text-xs text-slate-500">{x.memo}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{EXIT_TYPE_LABEL[x.exit_type]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRWFull(x.proceeds_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatKRWFull(x.cost_basis_amount)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${x.gain_amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {x.gain_amount >= 0 ? "+" : "−"}
                      {formatKRWFull(Math.abs(x.gain_amount))}
                    </td>
                    <td className="px-6 py-2.5 text-right tabular-nums">{x.multiple === null ? "-" : `${x.multiple.toFixed(2)}x`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

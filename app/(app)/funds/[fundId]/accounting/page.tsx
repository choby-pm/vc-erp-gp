import Link from "next/link";
import { ClosingPanel, ManualJournalForm, ReverseJournalButton } from "@/components/accounting-actions";
import { formatDate } from "@/lib/format";
import {
  CATEGORY_LABEL,
  SOURCE_LABEL,
  balanceSheet,
  fiscalPeriod,
  generalLedger,
  incomeStatement,
  listAccounts,
  listClosings,
  listJournal,
  trialBalance,
  type AccountCategory,
  type TrialBalanceRow,
} from "@/lib/services/accounting";
import { getFinancialStatements } from "@/lib/services/finance";
import { getFund } from "@/lib/services/funds";

// 재무·회계 탭의 회계 화면: 재무제표 · 장부(시산표 · 계정별 원장 · 분개장) · 결산 (D35)

const VIEWS = [
  { key: "statements", label: "재무제표" },
  { key: "trial", label: "시산표" },
  { key: "ledger", label: "계정별 원장" },
  { key: "journal", label: "분개장" },
  { key: "closing", label: "결산" },
] as const;
type View = (typeof VIEWS)[number]["key"];
const BOOK_VIEWS: View[] = ["trial", "ledger", "journal"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const won = (v: number) => (v < 0 ? `(${(-v).toLocaleString("ko-KR")})` : v.toLocaleString("ko-KR"));
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default async function AccountingPage(props: PageProps<"/funds/[fundId]/accounting">) {
  const { fundId } = await props.params;
  const raw = await props.searchParams;
  const pick = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const view: View = VIEWS.some((v) => v.key === pick("view")) ? (pick("view") as View) : "statements";
  const fund = await getFund(fundId);
  const to = DATE.test(pick("to") ?? "") ? pick("to")! : today();
  const defaultFrom = fiscalPeriod(Number(to.slice(0, 4)), fund.formation_date).start;
  const from = DATE.test(pick("from") ?? "") ? pick("from")! : defaultFrom;
  const href = (v: View, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ view: v, ...extra });
    return `/funds/${fundId}/accounting?${p}`;
  };

  return (
    <div className="space-y-6">
      {/* 재무제표·결산은 조합 탭에서 바로 간다. 장부(시산표·원장·분개장)만 여기서 한 번 더 나눈다 */}
      {BOOK_VIEWS.includes(view) && (
        <nav className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {VIEWS.filter((v) => BOOK_VIEWS.includes(v.key)).map((v) => (
            <Link
              key={v.key}
              href={href(v.key)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium ${view === v.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      )}

      {view === "statements" && <Statements fundId={fundId} from={from} to={to} formationDate={fund.formation_date} />}
      {view === "trial" && <TrialBalance fundId={fundId} asOf={to} />}
      {view === "ledger" && <Ledger fundId={fundId} code={pick("account") ?? "1010"} from={pick("from")} to={pick("to")} href={href} />}
      {view === "journal" && <Journal fundId={fundId} />}
      {view === "closing" && <Closing fundId={fundId} formationDate={fund.formation_date} />}
    </div>
  );
}

// ─── 재무제표 ──────────────────────────────────────────────────────────────

function DateRange({ fundId, from, to, showFrom }: { fundId: string; from: string; to: string; showFrom: boolean }) {
  return (
    <form action={`/funds/${fundId}/accounting`} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="view" value="statements" />
      {showFrom && (
        <>
          <label className="text-slate-500">손익 기간</label>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-2 py-1" />
          <span className="text-slate-400">~</span>
        </>
      )}
      <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="기준일" />
      <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50">조회</button>
    </form>
  );
}

type Row = { label: string; amount?: number; level?: 0 | 1 | 2; strong?: boolean; total?: boolean; muted?: boolean };

function StatementTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: Row[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`} className={r.total ? "border-t-2 border-double border-slate-300" : r.strong ? "border-t border-slate-200" : ""}>
              <td className={`py-2 pr-3 ${r.level === 2 ? "pl-12" : r.level === 1 ? "pl-9" : "pl-6"} ${r.strong || r.total ? "font-semibold text-slate-900" : r.muted ? "text-slate-400" : "text-slate-700"}`}>{r.label}</td>
              <td className={`py-2 pr-6 text-right tabular-nums ${r.strong || r.total ? "font-semibold text-slate-900" : r.muted ? "text-slate-400" : "text-slate-700"}`}>
                {r.amount === undefined ? "" : won(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function Statements({ fundId, from, to, formationDate }: { fundId: string; from: string; to: string; formationDate: string | null }) {
  const [bs, is, check] = await Promise.all([balanceSheet(fundId, to), incomeStatement(fundId, from, to), getFinancialStatements(fundId)]);
  const line = (r: TrialBalanceRow, level: 1 | 2 = 1): Row => ({ label: r.name, amount: r.is_contra ? -r.balance : r.balance, level });
  const section = (label: string, list: TrialBalanceRow[], total: number, extra: Row[] = []): Row[] => [
    { label, strong: true },
    ...(list.length ? list.map((r) => line(r)) : [{ label: "해당 없음", amount: 0, level: 1 as const, muted: true }]),
    ...extra,
    { label: `${label}총계`, amount: total, total: true },
  ];
  const bsRows: Row[] = [
    ...section("자산", bs.assets, bs.total_assets),
    ...section("부채", bs.liabilities, bs.total_liabilities),
    ...section("자본", bs.equity, bs.total_equity, bs.unclosed_income !== 0 ? [{ label: bs.unclosed_income >= 0 ? "미처분 당기순이익 (결산 전)" : "미처리 당기순손실 (결산 전)", amount: bs.unclosed_income, level: 1 }] : []),
    { label: "부채와자본총계", amount: bs.total_liabilities + bs.total_equity, total: true },
  ];
  const isRows: Row[] = [
    { label: "수익", strong: true },
    ...(is.revenue.length ? is.revenue.map((r) => line(r)) : [{ label: "해당 없음", amount: 0, level: 1 as const, muted: true }]),
    { label: "수익 합계", amount: is.total_revenue, total: true },
    { label: "비용", strong: true },
    ...(is.expenses.length ? is.expenses.map((r) => line(r)) : [{ label: "해당 없음", amount: 0, level: 1 as const, muted: true }]),
    { label: "비용 합계", amount: is.total_expense, total: true },
    { label: is.net_income >= 0 ? "당기순이익" : "당기순손실", amount: is.net_income, total: true },
  ];
  // 업무 기록 기준 숫자와 분개 기준 숫자가 맞는지 (분개 누락·오류 감지)
  const bookCash = bs.assets.find((a) => a.code === "1010")?.balance ?? 0;
  const reconciled = to === today() ? bookCash === check.balance_sheet.assets.cash : null;

  return (
    <div className="space-y-4">
      <DateRange fundId={fundId} from={from} to={to} showFrom />
      <div className="grid gap-6 lg:grid-cols-2">
        <StatementTable title="재무상태표" subtitle={`${formatDate(to)} 현재 · 분개 기준 · 단위: 원`} rows={bsRows} />
        <StatementTable title="손익계산서" subtitle={`${formatDate(from)} ~ ${formatDate(to)} · 결산 대체 전 · 단위: 원`} rows={isRows} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className={`rounded-lg px-4 py-3 text-sm ${bs.balanced ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
          {bs.balanced ? "대차 일치: 자산총계 = 부채와자본총계 ✓" : "대차 불일치: 분개를 확인하세요"}
        </p>
        {reconciled !== null && (
          <p className={`rounded-lg px-4 py-3 text-sm ${reconciled ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
            {reconciled ? "업무 기록과 대사 일치: 현금 계정 잔액 = 현금출납장 잔액 ✓" : `대사 불일치: 현금 계정 ${won(bookCash)} ≠ 현금출납장 ${won(check.balance_sheet.assets.cash)}`}
          </p>
        )}
      </div>
      <p className="text-xs text-slate-500">
        투자자산은 원가법으로 표시합니다 (공정가치 평가 분개 없음, ⚠️ 실무 확인 27번). 사업연도는 1/1~12/31, 결성한 해는 결성일부터로 가정합니다 (⚠️ 25번). 결성일: {formationDate ? formatDate(formationDate) : "결성 전"}
      </p>
    </div>
  );
}

// ─── 시산표 ────────────────────────────────────────────────────────────────

async function TrialBalance({ fundId, asOf }: { fundId: string; asOf: string }) {
  const rows = (await trialBalance(fundId, asOf)).filter((r) => r.debit > 0 || r.credit > 0);
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  const cats: AccountCategory[] = ["asset", "liability", "equity", "revenue", "expense"];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">합계잔액시산표</h2>
          <p className="mt-0.5 text-xs text-slate-500">{formatDate(asOf)} 현재 · 계정별 차변·대변 합계와 잔액 · 단위: 원</p>
        </div>
        <form action={`/funds/${fundId}/accounting`} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="view" value="trial" />
          <input type="date" name="to" defaultValue={asOf} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="기준일" />
          <button className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700">조회</button>
        </form>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-6 py-2.5">구분</th>
            <th className="px-3 py-2.5">계정과목</th>
            <th className="px-3 py-2.5 text-right">차변 합계</th>
            <th className="px-3 py-2.5 text-right">대변 합계</th>
            <th className="px-6 py-2.5 text-right">잔액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cats.flatMap((c) =>
            rows
              .filter((r) => r.category === c)
              .map((r) => (
                <tr key={r.code}>
                  <td className="px-6 py-2 text-slate-500">{CATEGORY_LABEL[c]}</td>
                  <td className="px-3 py-2">
                    <Link href={`/funds/${fundId}/accounting?view=ledger&account=${r.code}`} className="hover:text-indigo-600">
                      <span className="text-slate-400">{r.code}</span> {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{won(r.debit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{won(r.credit)}</td>
                  <td className="px-6 py-2 text-right tabular-nums">
                    {won(r.balance)} <span className="text-xs text-slate-400">{r.normal_side === "debit" ? "차" : "대"}</span>
                  </td>
                </tr>
              )),
          )}
        </tbody>
        <tfoot className="border-t-2 border-double border-slate-300 font-semibold">
          <tr>
            <td className="px-6 py-2.5" colSpan={2}>
              합계 {debit === credit ? <span className="ml-2 text-xs font-normal text-emerald-700">차변 = 대변 ✓</span> : <span className="ml-2 text-xs text-rose-600">불일치</span>}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{won(debit)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{won(credit)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {rows.length === 0 && <p className="px-6 py-8 text-center text-sm text-slate-500">아직 분개가 없습니다.</p>}
    </section>
  );
}

// ─── 계정별 원장 ───────────────────────────────────────────────────────────

async function Ledger({ fundId, code, from, to, href }: { fundId: string; code: string; from: string | null; to: string | null; href: (v: View, extra?: Record<string, string>) => string }) {
  const [accounts, ledger] = await Promise.all([listAccounts(), generalLedger(fundId, code, from && DATE.test(from) ? from : null, to && DATE.test(to) ? to : null)]);
  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <nav className="rounded-2xl border border-slate-200 bg-white p-3 text-sm lg:col-span-1">
        {(["asset", "liability", "equity", "revenue", "expense"] as AccountCategory[]).map((c) => (
          <div key={c} className="mb-2">
            <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">{CATEGORY_LABEL[c]}</p>
            {accounts
              .filter((a) => a.category === c)
              .map((a) => (
                <Link key={a.code} href={href("ledger", { account: a.code })} className={`block rounded-md px-2 py-1 ${a.code === code ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className="text-slate-400">{a.code}</span> {a.name}
                </Link>
              ))}
          </div>
        ))}
      </nav>
      <section className="rounded-2xl border border-slate-200 bg-white lg:col-span-3">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            <span className="text-slate-400">{ledger.account.code}</span> {ledger.account.name}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {CATEGORY_LABEL[ledger.account.category]} · 잔액은 {ledger.account.normal_side === "debit" ? "차변" : "대변"} 기준 · 기초 {won(ledger.opening_balance)} · 기말 <b>{won(ledger.closing_balance)}</b>
          </p>
        </div>
        {ledger.lines.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">이 계정의 분개가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-2.5">일자</th>
                <th className="px-3 py-2.5">분개</th>
                <th className="px-3 py-2.5">적요</th>
                <th className="px-3 py-2.5 text-right">차변</th>
                <th className="px-3 py-2.5 text-right">대변</th>
                <th className="px-6 py-2.5 text-right">잔액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.lines.map((l, i) => (
                <tr key={`${l.entry_id}-${i}`}>
                  <td className="px-6 py-2 whitespace-nowrap">{formatDate(l.entry_date)}</td>
                  <td className="px-3 py-2 text-slate-500">#{l.entry_no}</td>
                  <td className="px-3 py-2">
                    {l.description} <span className="text-xs text-slate-400">{SOURCE_LABEL[l.source_type]}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.debit ? won(l.debit) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.credit ? won(l.credit) : ""}</td>
                  <td className="px-6 py-2 text-right tabular-nums">{won(l.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ─── 분개장 ────────────────────────────────────────────────────────────────

async function Journal({ fundId }: { fundId: string }) {
  const [entries, accounts] = await Promise.all([listJournal(fundId), listAccounts()]);
  return (
    <div className="space-y-4">
      <ManualJournalForm fundId={fundId} accounts={accounts.map((a) => ({ code: a.code, name: a.name, category: a.category }))} />
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">분개장 {entries.length}건</h2>
          <p className="mt-0.5 text-xs text-slate-500">업무 기록에서 자동으로 만들어진 분개와 수동 분개. 분개는 수정·삭제할 수 없고 역분개로 정정합니다.</p>
        </div>
        {entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 분개가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className={`px-6 py-3 ${e.reversed ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-slate-400">#{e.entry_no}</span>
                  <span className="whitespace-nowrap text-slate-600">{formatDate(e.entry_date)}</span>
                  <span className="font-medium text-slate-900">{e.description}</span>
                  <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{SOURCE_LABEL[e.source_type]}</span>
                  {e.reversal_of_id && <span className="rounded bg-rose-100 px-1.5 text-[11px] text-rose-700">역분개</span>}
                  {e.reversed && <span className="rounded bg-slate-200 px-1.5 text-[11px] text-slate-600">역분개됨</span>}
                  {e.source_type === "manual" && !e.reversal_of_id && !e.reversed && (
                    <span className="ml-auto">
                      <ReverseJournalButton fundId={fundId} entryId={e.id} entryNo={e.entry_no} />
                    </span>
                  )}
                </div>
                <table className="mt-1.5 w-full max-w-2xl text-sm">
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}>
                        <td className={`py-0.5 ${l.credit ? "pl-10" : "pl-2"} text-slate-700`}>
                          <span className="text-slate-400">{l.account_code}</span> {l.account_name}
                        </td>
                        <td className="w-36 py-0.5 text-right tabular-nums">{l.debit ? won(l.debit) : ""}</td>
                        <td className="w-36 py-0.5 text-right tabular-nums">{l.credit ? won(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── 결산 ──────────────────────────────────────────────────────────────────

async function Closing({ fundId, formationDate }: { fundId: string; formationDate: string | null }) {
  const closings = await listClosings(fundId);
  if (!formationDate) {
    return <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">결성 전 조합은 결산하지 않습니다.</p>;
  }
  const first = Number(formationDate.slice(0, 4));
  const current = Number(today().slice(0, 4));
  const closedYears = new Set(closings.map((c) => c.fiscal_year));
  const years = [];
  for (let y = first; y <= current; y++) {
    if (closedYears.has(y)) continue;
    const { start, end } = fiscalPeriod(y, formationDate);
    const prevOpen = y > first && !closedYears.has(y - 1);
    const reason = end >= today() ? `사업연도가 끝난 뒤(${formatDate(end)} 이후)에 결산할 수 있습니다` : prevOpen ? `${y - 1} 사업연도를 먼저 결산하세요` : "결산할 수 있습니다";
    years.push({ year: y, start, end, closable: end < today() && !prevOpen, reason });
  }
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">사업연도 결산</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            결산하면 그 사업연도의 수익·비용 계정 잔액을 이익잉여금으로 대체하는 결산 분개를 만들고, 기간을 잠급니다. 잠긴 기간에는 업무 기록·분개를 넣을 수 없습니다. 되돌릴 수 없습니다.
          </p>
        </div>
        {years.length > 0 ? <ClosingPanel fundId={fundId} years={years} /> : <p className="px-6 py-6 text-sm text-slate-500">결산할 사업연도가 없습니다.</p>}
      </section>
      {closings.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">결산 이력</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {closings.map((c) => (
                <tr key={c.fiscal_year}>
                  <td className="px-6 py-2.5 font-semibold">{c.fiscal_year} 사업연도</td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {formatDate(c.period_start)} ~ {formatDate(c.period_end)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">당기순{c.net_income >= 0 ? "이익" : "손실"} {won(c.net_income)}원</td>
                  <td className="px-6 py-2.5 text-right text-slate-500">{formatDate(c.closed_at)} 결산</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import FundTabs from "@/components/fund-tabs";
import { FundStatusBadge } from "@/components/fund-status";
import { FUND_TYPE_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFundHeader } from "@/lib/services/funds";

// 조합 상세 공통 틀: 조합 이름·상태 + 업무 탭. 하위 화면은 탭 아래 내용만 그린다
export default async function FundLayout({ children, params }: LayoutProps<"/funds/[fundId]">) {
  const { fundId } = await params;
  const fund = await loadOrNotFound(() => getFundHeader(fundId));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/funds" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 조합 목록
        </Link>
        <div className="mt-3 mb-8 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{fund.name}</h1>
          <FundStatusBadge status={fund.status} />
          <span className="text-sm text-slate-500">{FUND_TYPE_LABEL[fund.fund_type]}</span>
          {fund.editable && (
            <Link href={`/funds/${fund.id}/edit`} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              기본 정보·규약 수정
            </Link>
          )}
        </div>
        {/* 탭이 주소의 ?view= 를 읽으므로 Suspense 로 감싼다 */}
        <Suspense fallback={<div className="h-20 border-b border-slate-200" />}>
          <FundTabs fundId={fund.id} formed={fund.formation_date !== null} />
        </Suspense>
      </div>
      {children}
    </div>
  );
}

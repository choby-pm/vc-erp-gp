// 화면 표시용 숫자 형식

// 1조 이상은 "1.5조 원", 1억 이상은 "150억 원", 그 아래는 "3,000,000원"
export function formatKRW(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  if (Math.abs(amount) >= 1_000_000_000_000) {
    return `${(amount / 1_000_000_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조 원`;
  }
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억 원`;
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}

// 전체 금액을 쉼표로 (마우스를 올렸을 때 보여주는 정확한 값)
export function formatKRWFull(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  return `${amount.toLocaleString("ko-KR")}원`;
}

// 비율(0.02) → "2%"
export function formatPercent(ratio: number | null | undefined, digits = 4): string {
  if (ratio === null || ratio === undefined) return "-";
  return `${(ratio * 100).toLocaleString("ko-KR", { maximumFractionDigits: digits })}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// 퍼센트 입력값(2) ↔ 저장 비율(0.02). 소수 6자리까지 (DB numeric(7,6))
export const percentToRatio = (percent: number) => Number((percent / 100).toFixed(6));
export const ratioToPercent = (ratio: number) => Number((ratio * 100).toFixed(4));

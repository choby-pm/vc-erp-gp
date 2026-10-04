// LP ERP 출자 분야 — GP 조합 분야와 같은 분류 (lib/labels.ts FUND_STRATEGY_LABEL, D47)
import { FUND_STRATEGIES, FUND_STRATEGY_LABEL } from "@/lib/labels";

export const LP_STRATEGY_LABEL: Record<string, string> = FUND_STRATEGY_LABEL;
export const LP_STRATEGIES: string[] = [...FUND_STRATEGIES];

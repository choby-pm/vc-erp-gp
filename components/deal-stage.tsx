import { DEAL_STAGE_LABEL, type DealStage } from "@/lib/labels";

const COLOR: Record<DealStage, string> = {
  sourcing: "bg-slate-100 text-slate-700",
  reviewing: "bg-sky-100 text-sky-800",
  ic: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  dropped: "bg-rose-100 text-rose-700",
};

export function DealStageBadge({ stage }: { stage: DealStage }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR[stage]}`}>{DEAL_STAGE_LABEL[stage]}</span>;
}

import { formatMoney } from "../../utils/formatMoney";
import type { FleetStatKey, FleetStats } from "./types";

type Props = {
  stats: FleetStats;
  activeKey?: FleetStatKey | null;
  onSelect?: (key: FleetStatKey) => void;
};

const items: Array<{
  key: FleetStatKey | "spend";
  label: string;
  tone: string;
  getValue: (stats: FleetStats) => string | number;
  filterable: boolean;
}> = [
  { key: "total", label: "Всего", tone: "neutral", getValue: (s) => s.total, filterable: true },
  { key: "online", label: "SSH онлайн", tone: "mint", getValue: (s) => s.online, filterable: true },
  { key: "offline", label: "Офлайн", tone: "rose", getValue: (s) => s.offline, filterable: true },
  { key: "agentOnline", label: "Агент", tone: "sky", getValue: (s) => s.agentOnline, filterable: true },
  { key: "expiringSoon", label: "Оплата < 3 дн.", tone: "amber", getValue: (s) => s.expiringSoon, filterable: true },
  {
    key: "spend",
    label: "Расход / мес",
    tone: "ice",
    getValue: (s) => (s.monthlySpend != null ? formatMoney(s.monthlySpend, s.currency) : "—"),
    filterable: false
  }
];

function ServersOverviewStats({ stats, activeKey = null, onSelect }: Props) {
  return (
    <section className="fleet-stats" aria-label="Сводка парка">
      {items.map((item) => {
        const isActive = item.filterable && activeKey === item.key;
        const className = `fleet-stat ${item.tone}${isActive ? " is-active" : ""}${
          item.filterable && onSelect ? " is-clickable" : ""
        }`;
        const body = (
          <>
            <span>{item.label}</span>
            <strong>{item.getValue(stats)}</strong>
          </>
        );
        if (item.filterable && onSelect) {
          return (
            <button
              key={item.key}
              type="button"
              className={className}
              aria-pressed={isActive}
              onClick={() => onSelect(item.key as FleetStatKey)}
            >
              {body}
            </button>
          );
        }
        return (
          <article key={item.key} className={className}>
            {body}
          </article>
        );
      })}
    </section>
  );
}

export default ServersOverviewStats;

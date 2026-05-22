import { formatMoney } from "../../utils/formatMoney";
import type { FleetStats } from "./types";

type Props = {
  stats: FleetStats;
};

function ServersOverviewStats({ stats }: Props) {
  return (
    <section className="stats-grid servers-overview-stats">
      <article className="stat-card ice">
        <span>Всего узлов</span>
        <strong>{stats.total}</strong>
      </article>
      <article className="stat-card mint">
        <span>SSH онлайн</span>
        <strong>{stats.online}</strong>
      </article>
      <article className="stat-card sky">
        <span>Агент активен</span>
        <strong>{stats.agentOnline}</strong>
      </article>
      <article className="stat-card rose">
        <span>SSH офлайн</span>
        <strong>{stats.offline}</strong>
      </article>
      <article className="stat-card amber">
        <span>Оплата &lt; 3 дн.</span>
        <strong>{stats.expiringSoon}</strong>
      </article>
      <article className="stat-card mint">
        <span>Расход / мес.</span>
        <strong>
          {stats.monthlySpend != null ? formatMoney(stats.monthlySpend, stats.currency) : "—"}
        </strong>
      </article>
    </section>
  );
}

export default ServersOverviewStats;

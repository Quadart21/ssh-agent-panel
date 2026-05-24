import { useEffect, useState } from "react";

import type { Group, Server } from "../../types";
import { billingPeriodLabel, formatMoney } from "../../utils/formatMoney";

export type ServerQuickPatch = {
  group_id?: number | null;
  monthly_cost?: number | null;
  billing_period?: string;
  currency?: string;
};

type Props = {
  server: Server;
  groups: Group[];
  canEdit: boolean;
  saving: boolean;
  onSave: (serverId: number, patch: ServerQuickPatch) => Promise<void>;
};

function ServerQuickFields({ server, groups, canEdit, saving, onSave }: Props) {
  const [groupId, setGroupId] = useState(String(server.group_id ?? ""));
  const [monthlyCost, setMonthlyCost] = useState(server.monthly_cost?.toString() ?? "");
  const [billingPeriod, setBillingPeriod] = useState(server.billing_period || "monthly");

  useEffect(() => {
    setGroupId(String(server.group_id ?? ""));
    setMonthlyCost(server.monthly_cost?.toString() ?? "");
    setBillingPeriod(server.billing_period || "monthly");
  }, [server.id, server.group_id, server.monthly_cost, server.billing_period]);

  if (!canEdit) {
    return (
      <div className="fleet-quick-fields readonly">
        <span className="server-chip">{server.group_name ?? "Без группы"}</span>
        {server.monthly_cost != null ? (
          <span className="server-chip muted-chip">
            {formatMoney(server.monthly_cost, server.currency)} {billingPeriodLabel(server.billing_period)}
          </span>
        ) : (
          <span className="server-chip muted-chip">Стоимость не указана</span>
        )}
      </div>
    );
  }

  async function saveGroup(nextGroupId: string) {
    setGroupId(nextGroupId);
    await onSave(server.id, {
      group_id: nextGroupId ? Number(nextGroupId) : null
    });
  }

  async function saveCost(nextCost = monthlyCost, nextPeriod = billingPeriod) {
    const trimmed = nextCost.trim();
    const parsed = trimmed ? Number(trimmed) : null;
    if (trimmed && !Number.isFinite(parsed)) {
      return;
    }
    await onSave(server.id, {
      monthly_cost: parsed,
      billing_period: nextPeriod
    });
  }

  return (
    <div className={`fleet-quick-fields ${saving ? "is-saving" : ""}`}>
      <label className="fleet-quick-field">
        <span className="fleet-quick-label">Группа</span>
        <select
          value={groupId}
          disabled={saving}
          onChange={(event) => void saveGroup(event.target.value)}
        >
          <option value="">Без группы</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fleet-quick-field">
        <span className="fleet-quick-label">Стоимость</span>
        <div className="fleet-cost-inputs">
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
            value={monthlyCost}
            disabled={saving}
            onChange={(event) => setMonthlyCost(event.target.value)}
            onBlur={() => void saveCost()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          <select
            value={billingPeriod}
            disabled={saving}
            onChange={(event) => {
              const next = event.target.value;
              setBillingPeriod(next);
              void saveCost(monthlyCost, next);
            }}
          >
            <option value="monthly">/ мес</option>
            <option value="quarterly">/ кв</option>
            <option value="yearly">/ год</option>
          </select>
        </div>
      </label>
      {server.monthly_equivalent != null && server.billing_period !== "monthly" && server.monthly_cost != null ? (
        <p className="fleet-quick-hint muted">
          ≈ {formatMoney(server.monthly_equivalent, server.currency)} / мес
        </p>
      ) : null}
    </div>
  );
}

export default ServerQuickFields;

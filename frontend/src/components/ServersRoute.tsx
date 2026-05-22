import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import type { ConnectionTestResult, Group, Server, ServerAccountingSummary, ServerMetricSnapshot, User } from "../types";
import ServersPage from "./ServersPage";
import type { ServerForm } from "./servers/types";

type Props = {
  groups: Group[];
  servers: Server[];
  metrics: ServerMetricSnapshot[];
  currentUser: User | null;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
};

const emptyServerForm: ServerForm = {
  name: "",
  ip: "",
  port: 22,
  login: "root",
  password_enc: "",
  key_path: "",
  group_id: "",
  pay_until: "",
  monthly_cost: "",
  billing_period: "monthly",
  currency: "RUB",
  provider: "",
  setup_cost: "",
  notes: "",
  test_connection: true
};

function hasAction(user: User | null, action: string) {
  if (!user) {
    return false;
  }
  return user.role === "admin" || user.action_permissions.includes(action);
}

function ServersRoute({ groups, servers, metrics, currentUser, onError, onReload }: Props) {
  const [form, setForm] = useState(emptyServerForm);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [accounting, setAccounting] = useState<ServerAccountingSummary | null>(null);
  const [accountingLoading, setAccountingLoading] = useState(true);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  async function loadAccounting() {
    setAccountingLoading(true);
    try {
      setAccounting(await api.serversAccounting());
    } catch (err) {
      setAccounting(null);
      onError(err instanceof Error ? err.message : "Не удалось загрузить бухгалтерию.");
    } finally {
      setAccountingLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounting();
  }, [servers.length]);

  async function handleSaveServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      const payload = {
        ...form,
        group_id: form.group_id ? Number(form.group_id) : null,
        pay_until: form.pay_until ? new Date(form.pay_until).toISOString() : null,
        password_enc: form.password_enc || null,
        key_path: form.key_path || null,
        monthly_cost: form.monthly_cost.trim() ? Number(form.monthly_cost) : null,
        setup_cost: form.setup_cost.trim() ? Number(form.setup_cost) : null,
        provider: form.provider.trim() || null,
        billing_period: form.billing_period,
        currency: form.currency
      };
      if (editingServerId) {
        await api.updateServer(editingServerId, payload);
      } else {
        await api.createServer(payload);
      }
      setForm(emptyServerForm);
      setEditingServerId(null);
      setConnectionResult(null);
      await onReload();
      await loadAccounting();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить сервер.");
    }
  }

  async function handleTestConnection() {
    onError("");
    try {
      const result = await api.testConnection({
        ip: form.ip,
        port: Number(form.port),
        login: form.login,
        password_enc: form.password_enc || null,
        key_path: form.key_path || null
      });
      setConnectionResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось проверить SSH.");
    }
  }

  async function handleDeleteServer(id: number) {
    onError("");
    try {
      await api.deleteServer(id);
      if (editingServerId === id) {
        setEditingServerId(null);
        setForm(emptyServerForm);
        setConnectionResult(null);
      }
      await onReload();
      await loadAccounting();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить сервер.");
    }
  }

  async function handleEnrollAgent(id: number) {
    onError("");
    try {
      const response = await api.enrollServerAgent(id);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(response.install_script);
        window.alert("Скрипт установки агента скопирован в буфер обмена. Выполни его на сервере под root.");
      } else {
        window.alert(`Токен агента: ${response.token}\n\nСкопируй install_script из API-ответа вручную.`);
      }
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось выпустить токен агента.");
    }
  }

  function resolveGroupId(rawValue: string): number | null {
    const cleaned = rawValue.trim();
    if (!cleaned) {
      return null;
    }
    const asNumber = Number(cleaned);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }
    const group = groups.find((item) => item.name.toLowerCase() === cleaned.toLowerCase());
    return group ? group.id : null;
  }

  async function handleBulkCreate() {
    onError("");
    const rows = bulkInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (rows.length === 0) {
      onError("Добавьте хотя бы одну строку для массового создания.");
      return;
    }
    const items: Record<string, unknown>[] = [];
    for (const row of rows) {
      const parts = row.split(";").map((part) => part.trim());
      if (parts.length < 4) {
        onError(`Неверный формат строки: "${row}"`);
        return;
      }
      const [name, ip, login, password, portRaw, groupRaw] = parts;
      const portValue = portRaw ? Number(portRaw) : 22;
      if (!name || !ip || !login) {
        onError(`Заполните name/ip/login в строке: "${row}"`);
        return;
      }
      if (!Number.isFinite(portValue) || portValue < 1 || portValue > 65535) {
        onError(`Неверный порт в строке: "${row}"`);
        return;
      }
      const lineGroupId = groupRaw ? resolveGroupId(groupRaw) : null;
      const defaultGroupId = bulkGroupId ? Number(bulkGroupId) : null;

      items.push({
        name,
        ip,
        login,
        port: Math.trunc(portValue),
        password_enc: password || null,
        key_path: null,
        group_id: lineGroupId ?? defaultGroupId,
        pay_until: null,
        monthly_cost: null,
        billing_period: "monthly",
        currency: "RUB",
        provider: null,
        setup_cost: null,
        notes: null,
        test_connection: true,
        auto_install_agent: true
      });
    }

    setBulkBusy(true);
    setBulkStatus("");
    try {
      const response = await api.createServersBulk({ items });
      setBulkStatus(`Создано: ${response.created}, ошибок: ${response.failed}.`);
      await onReload();
      await loadAccounting();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось выполнить массовое добавление.");
    } finally {
      setBulkBusy(false);
    }
  }

  function handleEditServer(server: Server) {
    setEditingServerId(server.id);
    setConnectionResult(null);
    setForm({
      name: server.name,
      ip: server.ip,
      port: server.port,
      login: server.login,
      password_enc: "",
      key_path: server.key_path ?? "",
      group_id: server.group_id ? String(server.group_id) : "",
      pay_until: server.pay_until ? new Date(server.pay_until).toISOString().slice(0, 16) : "",
      monthly_cost: server.monthly_cost != null ? String(server.monthly_cost) : "",
      billing_period: server.billing_period || "monthly",
      currency: server.currency || "RUB",
      provider: server.provider ?? "",
      setup_cost: server.setup_cost != null ? String(server.setup_cost) : "",
      notes: server.notes ?? "",
      test_connection: false
    });
  }

  function resetServerEditor() {
    setEditingServerId(null);
    setForm(emptyServerForm);
    setConnectionResult(null);
  }

  return (
    <ServersPage
      groups={groups}
      servers={servers}
      metrics={metrics}
      accounting={accounting}
      accountingLoading={accountingLoading}
      form={form}
      setForm={setForm}
      connectionResult={connectionResult}
      onSubmit={handleSaveServer}
      onTest={() => void handleTestConnection()}
      editingServerId={editingServerId}
      onEdit={handleEditServer}
      onCancelEdit={resetServerEditor}
      onDelete={(id) => void handleDeleteServer(id)}
      canCreate={hasAction(currentUser, "server_create")}
      canEdit={hasAction(currentUser, "server_update")}
      canDelete={hasAction(currentUser, "server_delete")}
      canEnrollAgent={currentUser?.role === "admin"}
      onEnrollAgent={(id) => void handleEnrollAgent(id)}
      bulkInput={bulkInput}
      setBulkInput={setBulkInput}
      bulkGroupId={bulkGroupId}
      setBulkGroupId={setBulkGroupId}
      onBulkCreate={() => void handleBulkCreate()}
      bulkStatus={bulkStatus}
      bulkBusy={bulkBusy}
    />
  );
}

export default ServersRoute;

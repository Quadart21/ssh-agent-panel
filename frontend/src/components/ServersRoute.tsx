import { FormEvent, useState } from "react";

import { api } from "../api";
import type { ConnectionTestResult, Group, Server, ServerMetricSnapshot, User } from "../types";
import ServersPage from "./ServersPage";

type Props = {
  groups: Group[];
  servers: Server[];
  metrics: ServerMetricSnapshot[];
  currentUser: User | null;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
};

const emptyServerForm = {
  name: "",
  ip: "",
  port: 22,
  login: "root",
  password_enc: "",
  key_path: "",
  group_id: "",
  pay_until: "",
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

  async function handleSaveServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      const payload = {
        ...form,
        group_id: form.group_id ? Number(form.group_id) : null,
        pay_until: form.pay_until ? new Date(form.pay_until).toISOString() : null,
        password_enc: form.password_enc || null,
        key_path: form.key_path || null
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
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить сервер.");
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
    />
  );
}

export default ServersRoute;

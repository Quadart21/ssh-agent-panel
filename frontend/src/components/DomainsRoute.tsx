import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { CloudflareDnsRecord, CloudflareDnsRecordForm, CloudflareSettings, CloudflareZone, User } from "../types";
import DomainsPage from "./DomainsPage";

type Props = {
  currentUser: User | null;
  onError: (message: string) => void;
};

const emptyRecordForm: CloudflareDnsRecordForm = {
  type: "A",
  name: "",
  content: "",
  ttl: "1",
  proxied: false,
  comment: "",
  priority: ""
};

function hasAction(user: User | null, action: string) {
  if (!user) {
    return false;
  }
  return user.role === "admin" || user.action_permissions.includes(action);
}

function DomainsRoute({ currentUser, onError }: Props) {
  const [settings, setSettings] = useState<CloudflareSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({ api_token: "", account_id: "", default_ttl: "1" });
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [records, setRecords] = useState<CloudflareDnsRecord[]>([]);
  const [search, setSearch] = useState("");
  const [recordType, setRecordType] = useState("");
  const [onlySubdomains, setOnlySubdomains] = useState(false);
  const [recordForm, setRecordForm] = useState(emptyRecordForm);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingZones, setLoadingZones] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const canManage = hasAction(currentUser, "domains_manage");
  const isAdmin = currentUser?.role === "admin";

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId]
  );

  async function loadSettings() {
    setLoadingSettings(true);
    onError("");
    try {
      const data = await api.cloudflareSettings();
      setSettings(data);
      setSettingsForm({
        api_token: data.api_token?.includes("…") ? "" : data.api_token ?? "",
        account_id: data.account_id ?? "",
        default_ttl: String(data.default_ttl ?? 1)
      });
      setStatusMessage(data.configured ? "Cloudflare подключён." : "Укажите API token Cloudflare.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить настройки Cloudflare.");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function loadZones() {
    setLoadingZones(true);
    onError("");
    try {
      const data = await api.listCloudflareZones();
      setZones(data);
      if (!selectedZoneId && data.length > 0) {
        setSelectedZoneId(data[0].id);
      }
    } catch (err) {
      setZones([]);
      onError(err instanceof Error ? err.message : "Не удалось загрузить зоны Cloudflare.");
    } finally {
      setLoadingZones(false);
    }
  }

  async function loadRecords(zoneId = selectedZoneId) {
    if (!zoneId) {
      setRecords([]);
      return;
    }
    setLoadingRecords(true);
    onError("");
    try {
      const data = await api.listCloudflareRecords(zoneId, {
        search: search.trim() || undefined,
        record_type: recordType || undefined,
        only_subdomains: onlySubdomains
      });
      setRecords(data);
    } catch (err) {
      setRecords([]);
      onError(err instanceof Error ? err.message : "Не удалось загрузить DNS-записи.");
    } finally {
      setLoadingRecords(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (settings?.configured) {
      void loadZones();
    }
  }, [settings?.configured]);

  useEffect(() => {
    if (selectedZoneId) {
      void loadRecords(selectedZoneId);
    }
  }, [selectedZoneId, search, recordType, onlySubdomains]);

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) {
      return;
    }
    onError("");
    setBusy(true);
    try {
      const updated = await api.updateCloudflareSettings({
        api_token: settingsForm.api_token.trim() ? settingsForm.api_token : settings?.api_token ?? null,
        account_id: settingsForm.account_id.trim() || null,
        default_ttl: Number(settingsForm.default_ttl) || 1
      });
      setSettings(updated);
      setStatusMessage("Настройки Cloudflare сохранены.");
      await loadZones();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить настройки Cloudflare.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestConnection() {
    onError("");
    setBusy(true);
    try {
      const response = await api.testCloudflare();
      setStatusMessage(response.message ?? "Cloudflare API доступен.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось проверить Cloudflare API.");
    } finally {
      setBusy(false);
    }
  }

  function resetRecordForm() {
    setEditingRecordId(null);
    setRecordForm(emptyRecordForm);
  }

  function handleEditRecord(record: CloudflareDnsRecord) {
    setEditingRecordId(record.id);
    setRecordForm({
      type: record.type,
      name: record.relative_name === "@" ? "@" : record.relative_name,
      content: record.content,
      ttl: String(record.ttl),
      proxied: Boolean(record.proxied),
      comment: record.comment ?? "",
      priority: record.priority != null ? String(record.priority) : ""
    });
  }

  async function handleSaveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !selectedZoneId) {
      return;
    }
    onError("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        type: recordForm.type,
        name: recordForm.name,
        content: recordForm.content,
        ttl: Number(recordForm.ttl) || 1,
        proxied: recordForm.proxied,
        comment: recordForm.comment.trim() || null
      };
      if (recordForm.type === "MX" && recordForm.priority.trim()) {
        payload.priority = Number(recordForm.priority);
      }
      if (editingRecordId) {
        await api.updateCloudflareRecord(selectedZoneId, editingRecordId, payload);
        setStatusMessage("DNS-запись обновлена.");
      } else {
        await api.createCloudflareRecord(selectedZoneId, payload);
        setStatusMessage("DNS-запись создана.");
      }
      resetRecordForm();
      await loadRecords(selectedZoneId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить DNS-запись.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    if (!canManage || !selectedZoneId) {
      return;
    }
    if (!window.confirm("Удалить DNS-запись?")) {
      return;
    }
    onError("");
    setBusy(true);
    try {
      const response = await api.deleteCloudflareRecord(selectedZoneId, recordId);
      setStatusMessage(response.message);
      if (editingRecordId === recordId) {
        resetRecordForm();
      }
      await loadRecords(selectedZoneId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить DNS-запись.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DomainsPage
      settings={settings}
      settingsForm={settingsForm}
      setSettingsForm={setSettingsForm}
      zones={zones}
      selectedZoneId={selectedZoneId}
      setSelectedZoneId={setSelectedZoneId}
      selectedZone={selectedZone}
      records={records}
      search={search}
      setSearch={setSearch}
      recordType={recordType}
      setRecordType={setRecordType}
      onlySubdomains={onlySubdomains}
      setOnlySubdomains={setOnlySubdomains}
      recordForm={recordForm}
      setRecordForm={setRecordForm}
      editingRecordId={editingRecordId}
      onSaveSettings={handleSaveSettings}
      onTestConnection={() => void handleTestConnection()}
      onRefreshZones={() => void loadZones()}
      onRefreshRecords={() => void loadRecords()}
      onSaveRecord={handleSaveRecord}
      onEditRecord={handleEditRecord}
      onCancelEdit={resetRecordForm}
      onDeleteRecord={(recordId) => void handleDeleteRecord(recordId)}
      loadingSettings={loadingSettings}
      loadingZones={loadingZones}
      loadingRecords={loadingRecords}
      busy={busy}
      statusMessage={statusMessage}
      canManage={canManage}
      isAdmin={isAdmin}
    />
  );
}

export default DomainsRoute;

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

const ZONE_STORAGE_KEY = "domains.selectedZoneId";

function hasAction(user: User | null, action: string) {
  if (!user) {
    return false;
  }
  return user.role === "admin" || user.action_permissions.includes(action);
}

function filterRecords(
  records: CloudflareDnsRecord[],
  search: string,
  recordType: string,
  onlySubdomains: boolean
) {
  const needle = search.trim().toLowerCase();
  return records.filter((record) => {
    if (onlySubdomains && !record.is_subdomain) {
      return false;
    }
    if (recordType && record.type !== recordType) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return (
      record.name.toLowerCase().includes(needle) ||
      record.relative_name.toLowerCase().includes(needle) ||
      record.content.toLowerCase().includes(needle) ||
      (record.comment ?? "").toLowerCase().includes(needle) ||
      record.type.toLowerCase().includes(needle)
    );
  });
}

function DomainsRoute({ currentUser, onError }: Props) {
  const [settings, setSettings] = useState<CloudflareSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({ api_token: "", account_id: "", default_ttl: "1" });
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState(() => {
    try {
      return localStorage.getItem(ZONE_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [allRecords, setAllRecords] = useState<CloudflareDnsRecord[]>([]);
  const [search, setSearch] = useState("");
  const [recordType, setRecordType] = useState("");
  const [onlySubdomains, setOnlySubdomains] = useState(false);
  const [recordForm, setRecordForm] = useState(emptyRecordForm);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const recordsCacheRef = useRef<Map<string, CloudflareDnsRecord[]>>(new Map());
  const recordsRequestRef = useRef(0);

  const canManage = hasAction(currentUser, "domains_manage");
  const isAdmin = currentUser?.role === "admin";

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId]
  );

  const records = useMemo(
    () => filterRecords(allRecords, search, recordType, onlySubdomains),
    [allRecords, search, recordType, onlySubdomains]
  );

  function applySettings(data: CloudflareSettings) {
    setSettings(data);
    setSettingsForm({
      api_token: data.api_token?.includes("…") ? "" : data.api_token ?? "",
      account_id: data.account_id ?? "",
      default_ttl: String(data.default_ttl ?? 1)
    });
  }

  function pickZone(nextZones: CloudflareZone[], preferredId = selectedZoneId) {
    if (nextZones.length === 0) {
      setSelectedZoneId("");
      return;
    }
    if (preferredId && nextZones.some((zone) => zone.id === preferredId)) {
      setSelectedZoneId(preferredId);
      return;
    }
    setSelectedZoneId(nextZones[0].id);
  }

  async function loadBootstrap(refresh = false) {
    setLoadingBootstrap(true);
    onError("");
    try {
      const data = await api.cloudflareBootstrap(refresh);
      applySettings(data.settings);
      setZones(data.zones);
      pickZone(data.zones);
      setStatusMessage(
        data.settings.configured
          ? refresh
            ? "Зоны обновлены."
            : `Загружено зон: ${data.zones.length}.`
          : "Укажите API token Cloudflare."
      );
      if (!data.settings.configured && isAdmin) {
        setShowSettings(true);
      }
    } catch (err) {
      setZones([]);
      onError(err instanceof Error ? err.message : "Не удалось загрузить домены.");
    } finally {
      setLoadingBootstrap(false);
    }
  }

  async function loadRecords(zoneId = selectedZoneId, { refresh = false } = {}) {
    if (!zoneId) {
      setAllRecords([]);
      return;
    }

    if (!refresh) {
      const cached = recordsCacheRef.current.get(zoneId);
      if (cached) {
        setAllRecords(cached);
        return;
      }
    }

    const requestId = ++recordsRequestRef.current;
    setLoadingRecords(true);
    onError("");
    try {
      const data = await api.listCloudflareRecords(zoneId, { refresh });
      if (recordsRequestRef.current !== requestId) {
        return;
      }
      recordsCacheRef.current.set(zoneId, data);
      setAllRecords(data);
    } catch (err) {
      if (recordsRequestRef.current !== requestId) {
        return;
      }
      setAllRecords([]);
      onError(err instanceof Error ? err.message : "Не удалось загрузить DNS-записи.");
    } finally {
      if (recordsRequestRef.current === requestId) {
        setLoadingRecords(false);
      }
    }
  }

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    try {
      if (selectedZoneId) {
        localStorage.setItem(ZONE_STORAGE_KEY, selectedZoneId);
      }
    } catch {
      /* ignore */
    }
    if (!settings?.configured || !selectedZoneId) {
      if (!selectedZoneId) {
        setAllRecords([]);
      }
      return;
    }
    void loadRecords(selectedZoneId);
  }, [selectedZoneId, settings?.configured]);

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
      applySettings(updated);
      setStatusMessage("Настройки Cloudflare сохранены.");
      recordsCacheRef.current.clear();
      await loadBootstrap(true);
      setShowSettings(false);
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
    setShowRecordForm(false);
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
    setShowRecordForm(true);
  }

  function handleStartCreate() {
    setEditingRecordId(null);
    setRecordForm({
      ...emptyRecordForm,
      ttl: String(settings?.default_ttl ?? 1)
    });
    setShowRecordForm(true);
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
      recordsCacheRef.current.delete(selectedZoneId);
      await loadRecords(selectedZoneId, { refresh: true });
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
      recordsCacheRef.current.delete(selectedZoneId);
      await loadRecords(selectedZoneId, { refresh: true });
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
      totalRecords={allRecords.length}
      search={search}
      setSearch={setSearch}
      recordType={recordType}
      setRecordType={setRecordType}
      onlySubdomains={onlySubdomains}
      setOnlySubdomains={setOnlySubdomains}
      recordForm={recordForm}
      setRecordForm={setRecordForm}
      editingRecordId={editingRecordId}
      showSettings={showSettings}
      setShowSettings={setShowSettings}
      showRecordForm={showRecordForm}
      onStartCreate={handleStartCreate}
      onSaveSettings={handleSaveSettings}
      onTestConnection={() => void handleTestConnection()}
      onRefreshZones={() => void loadBootstrap(true)}
      onRefreshRecords={() => void loadRecords(selectedZoneId, { refresh: true })}
      onSaveRecord={handleSaveRecord}
      onEditRecord={handleEditRecord}
      onCancelEdit={resetRecordForm}
      onDeleteRecord={(recordId) => void handleDeleteRecord(recordId)}
      loadingBootstrap={loadingBootstrap}
      loadingRecords={loadingRecords}
      busy={busy}
      statusMessage={statusMessage}
      canManage={canManage}
      isAdmin={isAdmin}
    />
  );
}

export default DomainsRoute;

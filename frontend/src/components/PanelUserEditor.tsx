import type { FormEvent } from "react";

import { sectionGroups } from "../navigation/config";
import {
  applyAccessPreset,
  panelAccessPresets,
  panelPermissionModules,
  permissionsFromModuleLevels,
  type AccessLevel,
  type PanelAccessPresetId
} from "../navigation/panelPermissions";
import type { PanelUserForm, Server } from "../types";

export type PanelUserEditorState = PanelUserForm & {
  preset: PanelAccessPresetId;
  moduleLevels: Record<string, AccessLevel>;
  serverScope: "all" | "selected";
};

type Props = {
  mode: "create" | "edit";
  form: PanelUserEditorState;
  setForm: (form: PanelUserEditorState) => void;
  servers: Server[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  busy?: boolean;
};

function syncPermissions(form: PanelUserEditorState, next: Partial<PanelUserEditorState>): PanelUserEditorState {
  const merged = { ...form, ...next };

  if (merged.role === "admin" || merged.preset === "admin") {
    return {
      ...merged,
      role: "admin",
      preset: "admin",
      section_permissions: [],
      action_permissions: [],
      allowed_server_ids: []
    };
  }

  if (next.preset && next.preset !== "custom") {
    const applied = applyAccessPreset(next.preset);
    return {
      ...merged,
      role: applied.role,
      section_permissions: applied.section_permissions,
      action_permissions: applied.action_permissions,
      moduleLevels: panelAccessPresets.find((item) => item.id === next.preset)?.levels ?? merged.moduleLevels
    };
  }

  if (next.moduleLevels) {
    const derived = permissionsFromModuleLevels(next.moduleLevels);
    return {
      ...merged,
      preset: "custom",
      role: "user",
      section_permissions: derived.section_permissions,
      action_permissions: derived.action_permissions
    };
  }

  return merged;
}

function PanelUserEditor({ mode, form, setForm, servers, onSubmit, onCancel, busy = false }: Props) {
  const isAdmin = form.role === "admin" || form.preset === "admin";
  const groupedModules = sectionGroups
    .filter((group) => group.key !== "administration")
    .map((group) => ({
      ...group,
      modules: panelPermissionModules.filter((module) => module.group === group.key)
    }))
    .filter((group) => group.modules.length > 0);

  function updateForm(next: Partial<PanelUserEditorState>) {
    setForm(syncPermissions(form, next));
  }

  function setModuleLevel(moduleId: string, level: AccessLevel) {
    updateForm({
      preset: "custom",
      moduleLevels: {
        ...form.moduleLevels,
        [moduleId]: level
      }
    });
  }

  function toggleServer(serverId: number) {
    const selected = form.allowed_server_ids.includes(serverId)
      ? form.allowed_server_ids.filter((id) => id !== serverId)
      : [...form.allowed_server_ids, serverId];
    updateForm({ allowed_server_ids: selected, serverScope: "selected" });
  }

  return (
    <article className="panel panel-user-editor">
      <div className="panel-head">
        <div>
          <h2>{mode === "create" ? "Новый пользователь" : "Редактирование пользователя"}</h2>
          <p className="muted">Выберите профиль доступа или настройте модули вручную.</p>
        </div>
        <button type="button" className="ghost" onClick={onCancel}>
          Закрыть
        </button>
      </div>

      <form className="panel-user-editor-form" onSubmit={onSubmit}>
        <section className="panel-user-section">
          <h3>1. Основные данные</h3>
          <div className="form-grid">
            {mode === "create" ? (
              <label>
                Email
                <input
                  value={form.email}
                  onChange={(event) => updateForm({ email: event.target.value })}
                  required
                  autoComplete="off"
                />
              </label>
            ) : (
              <label>
                Email
                <input value={form.email} readOnly />
              </label>
            )}
            <label>
              Имя
              <input
                value={form.full_name}
                onChange={(event) => updateForm({ full_name: event.target.value })}
                required
              />
            </label>
            <label>
              {mode === "create" ? "Пароль" : "Новый пароль"}
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateForm({ password: event.target.value })}
                required={mode === "create"}
                placeholder={mode === "edit" ? "Оставьте пустым, если менять не нужно" : ""}
              />
            </label>
            <label className="checkbox full-width">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => updateForm({ is_active: event.target.checked })}
              />
              Аккаунт активен
            </label>
          </div>
        </section>

        <section className="panel-user-section">
          <h3>2. Профиль доступа</h3>
          <div className="access-preset-grid">
            {panelAccessPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`access-preset-card ${form.preset === preset.id ? "active" : ""}`}
                onClick={() => updateForm({ preset: preset.id })}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
            <button
              type="button"
              className={`access-preset-card ${form.preset === "custom" ? "active" : ""}`}
              onClick={() => updateForm({ preset: "custom" })}
            >
              <strong>Свои настройки</strong>
              <span>Тонкая настройка по каждому модулю</span>
            </button>
          </div>
        </section>

        {!isAdmin ? (
          <>
            <section className="panel-user-section">
              <h3>3. Модули панели</h3>
              <p className="muted panel-user-section-note">
                Для каждого блока выберите: скрыть, только просмотр или управление с правом изменений.
              </p>
              <div className="permission-module-grid">
                {groupedModules.map((group) => (
                  <div key={group.key} className="permission-module-group">
                    <h4>{group.label}</h4>
                    {group.modules.map((module) => {
                      const level = form.moduleLevels[module.id] ?? "none";
                      return (
                        <div key={module.id} className="permission-module-card">
                          <div>
                            <strong>{module.label}</strong>
                            <p className="muted">{module.description}</p>
                          </div>
                          <div className="access-level-switch" role="group" aria-label={`Доступ: ${module.label}`}>
                            {(["none", "view", "edit"] as AccessLevel[]).map((option) => (
                              <button
                                key={option}
                                type="button"
                                className={`access-level-option ${level === option ? "active" : ""}`}
                                onClick={() => setModuleLevel(module.id, option)}
                              >
                                {option === "none" ? "Нет" : option === "view" ? "Просмотр" : "Управление"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {form.preset !== "custom" ? (
                <p className="muted panel-user-section-note">
                  Нажмите на уровень доступа модуля, чтобы перейти к ручной настройке.
                </p>
              ) : null}
            </section>

            <section className="panel-user-section">
              <h3>4. Доступ к серверам</h3>
              <div className="server-scope-switch">
                <label className={`server-scope-option ${form.serverScope === "all" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="server-scope"
                    checked={form.serverScope === "all"}
                    onChange={() => updateForm({ serverScope: "all", allowed_server_ids: [] })}
                  />
                  <span>
                    <strong>Все серверы</strong>
                    <small>Пользователь видит весь парк</small>
                  </span>
                </label>
                <label className={`server-scope-option ${form.serverScope === "selected" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="server-scope"
                    checked={form.serverScope === "selected"}
                    onChange={() => updateForm({ serverScope: "selected", allowed_server_ids: form.allowed_server_ids })}
                  />
                  <span>
                    <strong>Только выбранные</strong>
                    <small>Ограничить список серверов</small>
                  </span>
                </label>
              </div>

              {form.serverScope === "selected" ? (
                <div className="server-picker-grid">
                  {servers.map((server) => (
                    <label key={server.id} className="server-picker-item">
                      <input
                        type="checkbox"
                        checked={form.allowed_server_ids.includes(server.id)}
                        onChange={() => toggleServer(server.id)}
                      />
                      <span>
                        <strong>{server.name}</strong>
                        <small>{server.ip}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <section className="panel-user-section">
            <div className="panel-user-admin-note">
              <strong>Администратор</strong>
              <p className="muted">Имеет доступ ко всем разделам, серверам и действиям без ограничений.</p>
            </div>
          </section>
        )}

        <div className="panel-user-editor-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Сохранение…" : mode === "create" ? "Создать пользователя" : "Сохранить изменения"}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>
    </article>
  );
}

export default PanelUserEditor;

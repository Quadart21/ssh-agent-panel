import { FormEvent, useState } from "react";

import { api } from "../api";
import { createEmptyEditorState, editorStateFromUser } from "../navigation/panelPermissions";
import type { PanelUserCreated, Server, User } from "../types";
import { type PanelUserEditorState } from "./PanelUserEditor";
import PanelUsersPage from "./PanelUsersPage";

type Props = {
  users: User[];
  servers: Server[];
  currentUser: User | null;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
};

function PanelUsersRoute({ users, servers, currentUser, onError, onReload }: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editorForm, setEditorForm] = useState<PanelUserEditorState>(createEmptyEditorState());
  const [busy, setBusy] = useState(false);
  const [generatingPassword, setGeneratingPassword] = useState(false);
  const [createdResult, setCreatedResult] = useState<PanelUserCreated | null>(null);

  async function generatePasswordIntoForm() {
    setGeneratingPassword(true);
    onError("");
    try {
      const generated = await api.generatePanelUserPassword();
      setEditorForm((current) => ({ ...current, password: generated.password }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сгенерировать пароль.");
    } finally {
      setGeneratingPassword(false);
    }
  }

  async function openCreate() {
    setEditorMode("create");
    setEditingUserId(null);
    setCreatedResult(null);
    setEditorForm(createEmptyEditorState());
    setEditorOpen(true);
    await generatePasswordIntoForm();
  }

  function openEdit(user: User) {
    setEditorMode("edit");
    setEditingUserId(user.id);
    setCreatedResult(null);
    setEditorForm(editorStateFromUser(user));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingUserId(null);
    setEditorForm(createEmptyEditorState());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");

    if (editorForm.role !== "admin" && editorForm.serverScope === "selected" && editorForm.allowed_server_ids.length === 0) {
      onError("Выберите хотя бы один сервер или включите доступ ко всем серверам.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        full_name: editorForm.full_name,
        role: editorForm.role,
        is_active: editorForm.is_active,
        section_permissions: editorForm.section_permissions,
        action_permissions: editorForm.action_permissions,
        allowed_server_ids: editorForm.role === "admin" || editorForm.serverScope === "all" ? [] : editorForm.allowed_server_ids
      };

      if (editorMode === "create") {
        const created = await api.createPanelUser({
          ...payload,
          email: editorForm.email,
          password: editorForm.password.trim() || null,
          notify_telegram: editorForm.notify_telegram
        });
        setCreatedResult(created);
        closeEditor();
        await onReload();
      } else if (editingUserId) {
        await api.updatePanelUser(editingUserId, {
          ...payload,
          password: editorForm.password || null
        });
        closeEditor();
        await onReload();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить пользователя.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoutAllPanelUserSessions(userId: number) {
    onError("");
    try {
      await api.logoutAllPanelUserSessions(userId);
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось завершить сессии пользователя.");
    }
  }

  async function copyCreatedCredentials() {
    if (!createdResult) {
      return;
    }
    const text = [
      `Панель: ${window.location.origin}`,
      `Email: ${createdResult.email}`,
      `Пароль: ${createdResult.issued_password}`
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      onError("Не удалось скопировать данные в буфер обмена.");
    }
  }

  return (
    <PanelUsersPage
      users={users}
      servers={servers}
      currentUser={currentUser}
      editorOpen={editorOpen}
      editorMode={editorMode}
      editorForm={editorForm}
      setEditorForm={setEditorForm}
      busy={busy}
      generatingPassword={generatingPassword}
      createdResult={createdResult}
      onDismissCreatedResult={() => setCreatedResult(null)}
      onCopyCreatedCredentials={() => void copyCreatedCredentials()}
      onStartCreate={() => void openCreate()}
      onStartEdit={openEdit}
      onCancelEditor={closeEditor}
      onGeneratePassword={() => void generatePasswordIntoForm()}
      onSubmit={(event) => void handleSubmit(event)}
      onLogoutAllSessions={(userId) => void handleLogoutAllPanelUserSessions(userId)}
    />
  );
}

export default PanelUsersRoute;

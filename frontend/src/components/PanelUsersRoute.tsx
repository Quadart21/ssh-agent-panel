import { FormEvent, useState } from "react";

import { api } from "../api";
import type { PanelUserForm, Server, User } from "../types";
import PanelUsersPage from "./PanelUsersPage";

type Props = {
  users: User[];
  servers: Server[];
  currentUser: User | null;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
  permissionSections: string[];
};

const emptyPanelUserForm: PanelUserForm = {
  email: "",
  full_name: "",
  password: "",
  role: "user",
  is_active: true,
  section_permissions: [],
  action_permissions: [],
  allowed_server_ids: []
};

function PanelUsersRoute({ users, servers, currentUser, onError, onReload, permissionSections }: Props) {
  const [createForm, setCreateForm] = useState(emptyPanelUserForm);
  const [editStates, setEditStates] = useState<Record<number, PanelUserForm>>({});

  async function handleCreatePanelUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      await api.createPanelUser(createForm);
      setCreateForm(emptyPanelUserForm);
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось создать пользователя панели.");
    }
  }

  async function handleUpdatePanelUser(userId: number) {
    const state = editStates[userId];
    if (!state) {
      return;
    }
    onError("");
    try {
      await api.updatePanelUser(userId, {
        full_name: state.full_name,
        password: state.password || null,
        role: state.role,
        is_active: state.is_active,
        section_permissions: state.section_permissions,
        action_permissions: state.action_permissions,
        allowed_server_ids: state.allowed_server_ids
      });
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось обновить пользователя панели.");
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

  return (
    <PanelUsersPage
      users={users}
      servers={servers}
      currentUser={currentUser}
      createForm={createForm}
      setCreateForm={setCreateForm}
      editStates={editStates}
      setEditStates={setEditStates}
      onCreate={handleCreatePanelUser}
      onUpdate={(userId) => void handleUpdatePanelUser(userId)}
      onLogoutAllSessions={(userId) => void handleLogoutAllPanelUserSessions(userId)}
      permissionSections={permissionSections}
    />
  );
}

export default PanelUsersRoute;

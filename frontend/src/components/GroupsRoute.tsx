import { FormEvent, useState } from "react";

import { api } from "../api";
import type { Group, User } from "../types";
import GroupsPage from "./GroupsPage";

type Props = {
  groups: Group[];
  currentUser: User | null;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
};

const emptyGroupForm = {
  name: "",
  description: ""
};

function hasAction(user: User | null, action: string) {
  if (!user) {
    return false;
  }
  return user.role === "admin" || user.action_permissions.includes(action);
}

function GroupsRoute({ groups, currentUser, onError, onReload }: Props) {
  const [form, setForm] = useState(emptyGroupForm);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);

  async function handleSaveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      if (editingGroupId) {
        await api.updateGroup(editingGroupId, form);
      } else {
        await api.createGroup(form);
      }
      setForm(emptyGroupForm);
      setEditingGroupId(null);
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить группу.");
    }
  }

  async function handleDeleteGroup(id: number) {
    onError("");
    try {
      await api.deleteGroup(id);
      if (editingGroupId === id) {
        setEditingGroupId(null);
        setForm(emptyGroupForm);
      }
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить группу.");
    }
  }

  function handleEditGroup(group: Group) {
    setEditingGroupId(group.id);
    setForm({
      name: group.name,
      description: group.description ?? ""
    });
  }

  function resetGroupEditor() {
    setEditingGroupId(null);
    setForm(emptyGroupForm);
  }

  return (
    <GroupsPage
      groups={groups}
      form={form}
      setForm={setForm}
      onSubmit={handleSaveGroup}
      editingGroupId={editingGroupId}
      onEdit={handleEditGroup}
      onCancelEdit={resetGroupEditor}
      onDelete={(id) => void handleDeleteGroup(id)}
      canCreate={hasAction(currentUser, "group_create")}
      canEdit={hasAction(currentUser, "group_update")}
      canDelete={hasAction(currentUser, "group_delete")}
    />
  );
}

export default GroupsRoute;

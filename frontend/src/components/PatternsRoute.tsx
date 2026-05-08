import { FormEvent, useState } from "react";

import { api } from "../api";
import type { Pattern, User } from "../types";
import PatternsPage from "./PatternsPage";

type Props = {
  patterns: Pattern[];
  currentUser: User | null;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
};

const emptyPatternForm = {
  name: "",
  description: "",
  commands: ""
};

function hasAction(user: User | null, action: string) {
  if (!user) {
    return false;
  }
  return user.role === "admin" || user.action_permissions.includes(action);
}

function PatternsRoute({ patterns, currentUser, onError, onReload }: Props) {
  const [form, setForm] = useState(emptyPatternForm);
  const [editingPatternId, setEditingPatternId] = useState<number | null>(null);

  async function handleSavePattern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      const payload = {
        ...form,
        commands: form.commands.split("\n")
      };
      if (editingPatternId) {
        await api.updatePattern(editingPatternId, payload);
      } else {
        await api.createPattern(payload);
      }
      setForm(emptyPatternForm);
      setEditingPatternId(null);
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить шаблон.");
    }
  }

  async function handleDeletePattern(id: number) {
    onError("");
    try {
      await api.deletePattern(id);
      if (editingPatternId === id) {
        setEditingPatternId(null);
        setForm(emptyPatternForm);
      }
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить шаблон.");
    }
  }

  function handleEditPattern(pattern: Pattern) {
    setEditingPatternId(pattern.id);
    setForm({
      name: pattern.name,
      description: pattern.description ?? "",
      commands: pattern.commands.join("\n")
    });
  }

  function resetPatternEditor() {
    setEditingPatternId(null);
    setForm(emptyPatternForm);
  }

  return (
    <PatternsPage
      patterns={patterns}
      form={form}
      setForm={setForm}
      onSubmit={handleSavePattern}
      editingPatternId={editingPatternId}
      onEdit={handleEditPattern}
      onCancelEdit={resetPatternEditor}
      onDelete={(id) => void handleDeletePattern(id)}
      canCreate={hasAction(currentUser, "pattern_create")}
      canEdit={hasAction(currentUser, "pattern_update")}
      canDelete={hasAction(currentUser, "pattern_delete")}
    />
  );
}

export default PatternsRoute;

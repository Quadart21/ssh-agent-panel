import type { FormEvent } from "react";

import type { Group } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type GroupForm = {
  name: string;
  description: string;
};

type Props = {
  groups: Group[];
  form: GroupForm;
  setForm: (form: GroupForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  editingGroupId: number | null;
  onEdit: (group: Group) => void;
  onCancelEdit: () => void;
  onDelete: (groupId: number) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function GroupsPage({
  groups,
  form,
  setForm,
  onSubmit,
  editingGroupId,
  onEdit,
  onCancelEdit,
  onDelete,
  canCreate,
  canEdit,
  canDelete
}: Props) {
  return (
    <PageShell>
      <PageHero eyebrow="Инфраструктура" title="Группы" description="Группировка серверов для массовых операций." />

      <section className="dashboard-grid">
        <Panel
          title={editingGroupId ? "Редактировать группу" : "Новая группа"}
          actions={
            editingGroupId && canEdit ? (
              <button type="button" className="ghost" onClick={onCancelEdit}>
                Отменить
              </button>
            ) : null
          }
        >
          {canCreate || (editingGroupId && canEdit) ? (
            <form className="compact-form" onSubmit={onSubmit}>
              <input
                placeholder="Название группы"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <textarea
                rows={3}
                placeholder="Описание"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <button type="submit">{editingGroupId ? "Сохранить изменения" : "Добавить группу"}</button>
            </form>
          ) : (
            <p className="muted">У вас нет прав на создание или редактирование групп.</p>
          )}
        </Panel>

        <Panel title="Существующие группы">
          {groups.length === 0 ? (
            <EmptyState title="Групп пока нет" description="Добавьте первую группу слева." />
          ) : (
            <div className="list-stack">
              {groups.map((group) => (
                <article className="mini-card" key={group.id}>
                  <strong>{group.name}</strong>
                  <p>{group.description || "Без описания"}</p>
                  <span>{group.server_count} серверов</span>
                  {canEdit || canDelete ? (
                    <div className="card-actions">
                      {canEdit ? (
                        <button type="button" className="ghost" onClick={() => onEdit(group)}>
                          Редактировать
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button type="button" className="danger" onClick={() => onDelete(group.id)}>
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </PageShell>
  );
}

export default GroupsPage;

import type { FormEvent } from "react";

import type { Group } from "../types";

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
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Группы</p>
          <h1>Логическая структура серверов</h1>
          <p className="hero-copy">Разделяйте узлы по проектам, клиентам или ролям, чтобы массовые операции были удобнее.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>{editingGroupId ? "Редактировать группу" : "Новая группа"}</h2>
            {editingGroupId && canEdit ? (
              <button type="button" className="ghost" onClick={onCancelEdit}>
                Отменить
              </button>
            ) : null}
          </div>
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
        </article>

        <article className="panel">
          <h2>Существующие группы</h2>
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
        </article>
      </section>
    </div>
  );
}

export default GroupsPage;

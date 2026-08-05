import type { FormEvent } from "react";

import type { Pattern } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type PatternForm = {
  name: string;
  description: string;
  commands: string;
};

type Props = {
  patterns: Pattern[];
  form: PatternForm;
  setForm: (form: PatternForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  editingPatternId: number | null;
  onEdit: (pattern: Pattern) => void;
  onCancelEdit: () => void;
  onDelete: (patternId: number) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function PatternsPage({
  patterns,
  form,
  setForm,
  onSubmit,
  editingPatternId,
  onEdit,
  onCancelEdit,
  onDelete,
  canCreate,
  canEdit,
  canDelete
}: Props) {
  return (
    <PageShell>
      <PageHero eyebrow="Шаблоны" title="Шаблоны" description="Переиспользуемые цепочки команд для ручного запуска и массовых операций." />

      <section className="dashboard-grid">
        <Panel
          title={editingPatternId ? "Редактировать шаблон" : "Новый шаблон"}
          actions={
            editingPatternId && canEdit ? (
              <button type="button" className="ghost" onClick={onCancelEdit}>
                Отменить
              </button>
            ) : null
          }
        >
          {canCreate || (editingPatternId && canEdit) ? (
            <form className="compact-form" onSubmit={onSubmit}>
              <input
                placeholder="Название шаблона"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <textarea
                rows={2}
                placeholder="Описание"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <textarea
                rows={6}
                placeholder="Одна команда на строку"
                value={form.commands}
                onChange={(event) => setForm({ ...form, commands: event.target.value })}
              />
              <button type="submit">{editingPatternId ? "Сохранить изменения" : "Сохранить шаблон"}</button>
            </form>
          ) : (
            <p className="muted">У вас нет прав на создание или редактирование шаблонов.</p>
          )}
        </Panel>

        <Panel title="Список шаблонов">
          {patterns.length === 0 ? (
            <EmptyState title="Шаблонов пока нет" description="Создайте первый шаблон слева." />
          ) : (
            <div className="list-stack">
              {patterns.map((pattern) => (
                <article className="mini-card" key={pattern.id}>
                  <strong>{pattern.name}</strong>
                  <p>{pattern.description || "Переиспользуемый набор команд"}</p>
                  <code>{pattern.commands.join(" && ")}</code>
                  {canEdit || canDelete ? (
                    <div className="card-actions">
                      {canEdit ? (
                        <button type="button" className="ghost" onClick={() => onEdit(pattern)}>
                          Редактировать
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button type="button" className="danger" onClick={() => onDelete(pattern.id)}>
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

export default PatternsPage;

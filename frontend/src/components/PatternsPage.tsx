import type { FormEvent } from "react";

import type { Pattern } from "../types";

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
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Шаблоны</p>
          <h1>Переиспользуемые команды</h1>
          <p className="hero-copy">Храните типовые цепочки команд, чтобы запускать их вручную или использовать в массовых операциях.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>{editingPatternId ? "Редактировать шаблон" : "Новый шаблон"}</h2>
            {editingPatternId && canEdit ? (
              <button type="button" className="ghost" onClick={onCancelEdit}>
                Отменить
              </button>
            ) : null}
          </div>
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
        </article>

        <article className="panel">
          <h2>Список шаблонов</h2>
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
        </article>
      </section>
    </div>
  );
}

export default PatternsPage;

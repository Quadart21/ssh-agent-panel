import type { FormEvent } from "react";

import { summarizeAccess } from "../navigation/panelPermissions";
import type { User } from "../types";
import PanelUserEditor, { type PanelUserEditorState } from "./PanelUserEditor";
import type { Server } from "../types";

type Props = {
  users: User[];
  servers: Server[];
  currentUser: User | null;
  editorOpen: boolean;
  editorMode: "create" | "edit";
  editorForm: PanelUserEditorState;
  setEditorForm: (form: PanelUserEditorState) => void;
  busy: boolean;
  onStartCreate: () => void;
  onStartEdit: (user: User) => void;
  onCancelEditor: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLogoutAllSessions: (userId: number) => void;
};

function PanelUsersPage({
  users,
  servers,
  currentUser,
  editorOpen,
  editorMode,
  editorForm,
  setEditorForm,
  busy,
  onStartCreate,
  onStartEdit,
  onCancelEditor,
  onSubmit,
  onLogoutAllSessions
}: Props) {
  return (
    <div className="page-stack panel-users-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Доступ</p>
          <h1>Пользователи панели</h1>
          <p className="hero-copy">
            Выдавайте доступ по понятным профилям: только просмотр, оператор, редактор или администратор. Без длинных
            списков галочек.
          </p>
        </div>
        {!editorOpen ? (
          <button type="button" onClick={onStartCreate}>
            + Новый пользователь
          </button>
        ) : null}
      </section>

      {editorOpen ? (
        <PanelUserEditor
          mode={editorMode}
          form={editorForm}
          setForm={setEditorForm}
          servers={servers}
          onSubmit={onSubmit}
          onCancel={onCancelEditor}
          busy={busy}
        />
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Пользователи</h2>
          <span className="muted">{users.length} аккаунт(ов)</span>
        </div>

        {users.length === 0 ? <p className="muted">Пока нет других пользователей панели.</p> : null}

        <div className="panel-users-list">
          {users.map((user) => (
            <article className="panel-user-card" key={user.id}>
              <div className="panel-user-card-main">
                <div>
                  <strong>{user.full_name}</strong>
                  <p className="muted">{user.email}</p>
                  <p className="panel-user-access-line">{summarizeAccess(user.role, user.section_permissions, user.action_permissions)}</p>
                  {user.role !== "admin" && user.allowed_server_ids.length > 0 ? (
                    <p className="muted">Серверов: {user.allowed_server_ids.length}</p>
                  ) : user.role !== "admin" ? (
                    <p className="muted">Все серверы</p>
                  ) : null}
                  {user.must_change_password ? <p className="muted">Требуется смена пароля при входе.</p> : null}
                  {currentUser?.id === user.id ? <p className="muted">Это ваш аккаунт</p> : null}
                </div>
                <div className="panel-user-card-side">
                  <span className={`status-pill ${user.is_active ? "online" : "offline"}`}>
                    {user.is_active ? "активен" : "отключён"}
                  </span>
                  <span className="status-pill pending">{user.role === "admin" ? "admin" : "user"}</span>
                </div>
              </div>
              <div className="card-actions">
                <button type="button" className="ghost" onClick={() => onStartEdit(user)}>
                  Настроить доступ
                </button>
                {currentUser?.id !== user.id ? (
                  <button type="button" className="ghost" onClick={() => onLogoutAllSessions(user.id)}>
                    Завершить сессии
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default PanelUsersPage;

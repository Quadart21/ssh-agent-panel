import type { FormEvent } from "react";

import type { PanelUserForm, Server, User } from "../types";

type Props = {
  users: User[];
  servers: Server[];
  currentUser: User | null;
  createForm: PanelUserForm;
  setCreateForm: (form: PanelUserForm) => void;
  editStates: Record<number, PanelUserForm>;
  setEditStates: (value: Record<number, PanelUserForm>) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (userId: number) => void;
  onLogoutAllSessions: (userId: number) => void;
  permissionSections: string[];
};

function PanelUsersPage({
  users,
  servers,
  currentUser,
  createForm,
  setCreateForm,
  editStates,
  setEditStates,
  onCreate,
  onUpdate,
  onLogoutAllSessions,
  permissionSections
}: Props) {
  const actionOptions = [
    { key: "server_create", label: "Создание серверов" },
    { key: "server_update", label: "Редактирование серверов" },
    { key: "server_delete", label: "Удаление серверов" },
    { key: "group_create", label: "Создание групп" },
    { key: "group_update", label: "Редактирование групп" },
    { key: "group_delete", label: "Удаление групп" },
    { key: "pattern_create", label: "Создание шаблонов" },
    { key: "pattern_update", label: "Редактирование шаблонов" },
    { key: "pattern_delete", label: "Удаление шаблонов" },
    { key: "command_run", label: "Запуск массовых команд" },
    { key: "automation_run", label: "Запуск автоматизации" },
    { key: "terminal_use", label: "Использование терминала" },
    { key: "pm2_use", label: "Работа с PM2" },
    { key: "linux_users_manage", label: "Управление Linux-пользователями" },
    { key: "firewall_manage", label: "Управление firewall" },
    { key: "security_manage", label: "Security-действия" }
  ];

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Пользователи панели</p>
          <h1>Доступ и роли в панели управления</h1>
          <p className="hero-copy">
            Создавайте операторов панели, назначайте роли `admin/user` и включайте или отключайте доступ без работы с БД.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <h2>Новый пользователь панели</h2>
          <form className="form-grid" onSubmit={onCreate}>
            <label>
              Email
              <input value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} required />
            </label>
            <label>
              Имя
              <input value={createForm.full_name} onChange={(event) => setCreateForm({ ...createForm, full_name: event.target.value })} required />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                required
              />
            </label>
            <label>
              Роль
              <select value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label className="checkbox full-width">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
              />
              Аккаунт активен
            </label>
            <div className="full-width settings-checklist">
              <strong>Разделы</strong>
              {permissionSections.map((section) => (
                <label className="checkbox" key={`create-section-${section}`}>
                  <input
                    type="checkbox"
                    checked={createForm.section_permissions.includes(section)}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        section_permissions: event.target.checked
                          ? [...createForm.section_permissions, section]
                          : createForm.section_permissions.filter((item) => item !== section)
                      })
                    }
                  />
                  {section}
                </label>
              ))}
            </div>
            <div className="full-width settings-checklist">
              <strong>Функции</strong>
              {actionOptions.map((action) => (
                <label className="checkbox" key={`create-action-${action.key}`}>
                  <input
                    type="checkbox"
                    checked={createForm.action_permissions.includes(action.key)}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        action_permissions: event.target.checked
                          ? [...createForm.action_permissions, action.key]
                          : createForm.action_permissions.filter((item) => item !== action.key)
                      })
                    }
                  />
                  {action.label}
                </label>
              ))}
            </div>
            <div className="full-width settings-checklist">
              <strong>Доступные серверы</strong>
              {servers.map((server) => (
                <label className="checkbox" key={`create-server-${server.id}`}>
                  <input
                    type="checkbox"
                    checked={createForm.allowed_server_ids.includes(server.id)}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        allowed_server_ids: event.target.checked
                          ? [...createForm.allowed_server_ids, server.id]
                          : createForm.allowed_server_ids.filter((id) => id !== server.id)
                      })
                    }
                  />
                  {server.name}
                </label>
              ))}
            </div>
            <button type="submit">Создать пользователя</button>
          </form>
        </article>

        <article className="panel">
          <h2>Существующие пользователи</h2>
          <div className="result-stack">
            {users.length === 0 ? <p className="muted">Пока нет других пользователей панели.</p> : null}
            {users.map((user) => {
              const state = editStates[user.id] ?? {
                email: user.email,
                full_name: user.full_name,
                password: "",
                role: user.role,
                is_active: user.is_active,
                section_permissions: user.section_permissions,
                action_permissions: user.action_permissions,
                allowed_server_ids: user.allowed_server_ids
              };
              return (
                <article className="result-card" key={user.id}>
                  <div className="server-card-row">
                    <strong>{user.email}</strong>
                    <span className={`status-pill ${user.is_active ? "online" : "offline"}`}>
                      {user.is_active ? "активен" : "отключён"}
                    </span>
                  </div>
                  <p className="muted">
                    {user.full_name} · {user.role}
                    {currentUser?.id === user.id ? " · это ваш аккаунт" : ""}
                  </p>
                  {user.must_change_password ? <p className="muted">Требуется смена пароля при следующем входе.</p> : null}
                  <div className="form-grid">
                    <label>
                      Имя
                      <input
                        value={state.full_name}
                        onChange={(event) =>
                          setEditStates({
                            ...editStates,
                            [user.id]: { ...state, full_name: event.target.value }
                          })
                        }
                      />
                    </label>
                    <label>
                      Роль
                      <select
                        value={state.role}
                        onChange={(event) =>
                          setEditStates({
                            ...editStates,
                            [user.id]: { ...state, role: event.target.value }
                          })
                        }
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                    <label className="full-width">
                      Новый пароль
                      <input
                        type="password"
                        value={state.password}
                        onChange={(event) =>
                          setEditStates({
                            ...editStates,
                            [user.id]: { ...state, password: event.target.value }
                          })
                        }
                        placeholder="Оставьте пустым, если пароль менять не нужно"
                      />
                    </label>
                    <label className="checkbox full-width">
                      <input
                        type="checkbox"
                        checked={state.is_active}
                        onChange={(event) =>
                          setEditStates({
                            ...editStates,
                            [user.id]: { ...state, is_active: event.target.checked }
                          })
                        }
                      />
                      Аккаунт активен
                    </label>
                    <div className="full-width settings-checklist">
                      <strong>Разделы</strong>
                      {permissionSections.map((section) => (
                        <label className="checkbox" key={`${user.id}-section-${section}`}>
                          <input
                            type="checkbox"
                            checked={state.section_permissions.includes(section)}
                            onChange={(event) =>
                              setEditStates({
                                ...editStates,
                                [user.id]: {
                                  ...state,
                                  section_permissions: event.target.checked
                                    ? [...state.section_permissions, section]
                                    : state.section_permissions.filter((item) => item !== section)
                                }
                              })
                            }
                          />
                          {section}
                        </label>
                      ))}
                    </div>
                    <div className="full-width settings-checklist">
                      <strong>Функции</strong>
                      {actionOptions.map((action) => (
                        <label className="checkbox" key={`${user.id}-action-${action.key}`}>
                          <input
                            type="checkbox"
                            checked={state.action_permissions.includes(action.key)}
                            onChange={(event) =>
                              setEditStates({
                                ...editStates,
                                [user.id]: {
                                  ...state,
                                  action_permissions: event.target.checked
                                    ? [...state.action_permissions, action.key]
                                    : state.action_permissions.filter((item) => item !== action.key)
                                }
                              })
                            }
                          />
                          {action.label}
                        </label>
                      ))}
                    </div>
                    <div className="full-width settings-checklist">
                      <strong>Доступные серверы</strong>
                      {servers.map((server) => (
                        <label className="checkbox" key={`${user.id}-server-${server.id}`}>
                          <input
                            type="checkbox"
                            checked={state.allowed_server_ids.includes(server.id)}
                            onChange={(event) =>
                              setEditStates({
                                ...editStates,
                                [user.id]: {
                                  ...state,
                                  allowed_server_ids: event.target.checked
                                    ? [...state.allowed_server_ids, server.id]
                                    : state.allowed_server_ids.filter((id) => id !== server.id)
                                }
                              })
                            }
                          />
                          {server.name}
                        </label>
                      ))}
                    </div>
                    <div className="panel-actions full-width">
                      <button type="button" onClick={() => onUpdate(user.id)}>
                        Сохранить изменения
                      </button>
                      {currentUser?.id !== user.id ? (
                        <button type="button" className="ghost" onClick={() => onLogoutAllSessions(user.id)}>
                          Завершить все сессии
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}

export default PanelUsersPage;

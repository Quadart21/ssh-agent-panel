import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api";
import type { Group, LinuxUser, LinuxUserOperationResponse, Server } from "../types";

type CreateForm = {
  server_ids: number[];
  group_id: string;
  username: string;
  password: string;
  ssh_public_key: string;
  sudo_access: boolean;
};

type DeleteForm = {
  server_ids: number[];
  group_id: string;
  username: string;
  purge_home: boolean;
};

type Props = {
  servers: Server[];
  groups: Group[];
  onError: (message: string) => void;
};

const emptyCreateForm: CreateForm = {
  server_ids: [],
  group_id: "",
  username: "",
  password: "",
  ssh_public_key: "",
  sudo_access: false
};

const emptyDeleteForm: DeleteForm = {
  server_ids: [],
  group_id: "",
  username: "",
  purge_home: true
};

function UsersPage({ servers, groups, onError }: Props) {
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [serverUsers, setServerUsers] = useState<LinuxUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [deleteForm, setDeleteForm] = useState<DeleteForm>(emptyDeleteForm);
  const [results, setResults] = useState<LinuxUserOperationResponse | null>(null);
  const [status, setStatus] = useState("Выберите сервер, чтобы посмотреть локальных пользователей.");

  useEffect(() => {
    if (!selectedServerId) {
      setServerUsers([]);
      setStatus("Выберите сервер, чтобы посмотреть локальных пользователей.");
      return;
    }

    setUsersLoading(true);
    setStatus("Загружаю список пользователей...");
    void api
      .listLinuxUsers(Number(selectedServerId))
      .then((data) => {
        setServerUsers(data);
        setStatus(data.length ? "Список пользователей обновлён." : "На сервере не найдено подходящих пользователей.");
      })
      .catch((err: unknown) => {
        onError(err instanceof Error ? err.message : "Не удалось загрузить пользователей сервера.");
      })
      .finally(() => setUsersLoading(false));
  }, [selectedServerId, onError]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResults(null);
    onError("");
    try {
      const response = await api.createLinuxUser({
        server_ids: createForm.server_ids,
        group_id: createForm.group_id ? Number(createForm.group_id) : null,
        username: createForm.username,
        password: createForm.password || null,
        ssh_public_key: createForm.ssh_public_key || null,
        sudo_access: createForm.sudo_access
      });
      setResults(response);
      setCreateForm(emptyCreateForm);
      if (selectedServerId) {
        const refreshed = await api.listLinuxUsers(Number(selectedServerId));
        setServerUsers(refreshed);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось создать пользователя.");
    }
  }

  async function handleDeleteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResults(null);
    onError("");
    try {
      const response = await api.deleteLinuxUser({
        server_ids: deleteForm.server_ids,
        group_id: deleteForm.group_id ? Number(deleteForm.group_id) : null,
        username: deleteForm.username,
        purge_home: deleteForm.purge_home
      });
      setResults(response);
      if (selectedServerId) {
        const refreshed = await api.listLinuxUsers(Number(selectedServerId));
        setServerUsers(refreshed);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить пользователя.");
    }
  }

  function toggleCreateServer(serverId: number) {
    setCreateForm((current) => ({
      ...current,
      server_ids: current.server_ids.includes(serverId)
        ? current.server_ids.filter((id) => id !== serverId)
        : [...current.server_ids, serverId]
    }));
  }

  function toggleDeleteServer(serverId: number) {
    setDeleteForm((current) => ({
      ...current,
      server_ids: current.server_ids.includes(serverId)
        ? current.server_ids.filter((id) => id !== serverId)
        : [...current.server_ids, serverId]
    }));
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Пользователи</p>
          <h1>Управление Linux-пользователями</h1>
          <p className="hero-copy">
            Создавайте и удаляйте системных пользователей по одному серверу, по списку или сразу по группе.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Пользователи на сервере</h2>
            <select value={selectedServerId} onChange={(event) => setSelectedServerId(event.target.value)}>
              <option value="">Выберите сервер</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </div>
          <p className="muted">{status}</p>
          <div className="list-stack">
            {usersLoading ? <p className="muted">Загрузка...</p> : null}
            {!usersLoading && serverUsers.length === 0 ? <p className="muted">Список пока пуст.</p> : null}
            {serverUsers.map((user) => (
              <article className="mini-card" key={`${user.username}-${user.shell ?? "noshell"}`}>
                <div className="server-card-row">
                  <strong>{user.username}</strong>
                  <span className="muted">{user.shell ?? "shell не определён"}</span>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <h2>Создать пользователя</h2>
          <form className="command-grid" onSubmit={handleCreateUser}>
            <label>
              Группа серверов
              <select value={createForm.group_id} onChange={(event) => setCreateForm({ ...createForm, group_id: event.target.value })}>
                <option value="">Не выбрана</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Имя пользователя
              <input
                value={createForm.username}
                onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
                placeholder="deploy"
                required
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                placeholder="Можно оставить пустым"
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={createForm.sudo_access}
                onChange={(event) => setCreateForm({ ...createForm, sudo_access: event.target.checked })}
              />
              Выдать sudo-доступ
            </label>
            <label className="full-width">
              Публичный SSH-ключ
              <textarea
                rows={4}
                value={createForm.ssh_public_key}
                onChange={(event) => setCreateForm({ ...createForm, ssh_public_key: event.target.value })}
                placeholder="ssh-ed25519 AAAA..."
              />
            </label>
            <div className="full-width">
              <span className="label-title">Отдельные серверы</span>
              <div className="chip-grid">
                {servers.map((server) => (
                  <label className="server-chip" key={`create-${server.id}`}>
                    <input
                      type="checkbox"
                      checked={createForm.server_ids.includes(server.id)}
                      onChange={() => toggleCreateServer(server.id)}
                    />
                    <span>{server.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit">Создать пользователя</button>
          </form>
        </article>
      </section>

      <section className="page-stack">
        <article className="panel">
          <h2>Удалить пользователя</h2>
          <form className="command-grid" onSubmit={handleDeleteUser}>
            <label>
              Группа серверов
              <select value={deleteForm.group_id} onChange={(event) => setDeleteForm({ ...deleteForm, group_id: event.target.value })}>
                <option value="">Не выбрана</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Имя пользователя
              <input
                value={deleteForm.username}
                onChange={(event) => setDeleteForm({ ...deleteForm, username: event.target.value })}
                placeholder="deploy"
                required
              />
            </label>
            <label className="checkbox full-width">
              <input
                type="checkbox"
                checked={deleteForm.purge_home}
                onChange={(event) => setDeleteForm({ ...deleteForm, purge_home: event.target.checked })}
              />
              Удалять домашнюю директорию и файлы пользователя
            </label>
            <div className="full-width">
              <span className="label-title">Отдельные серверы</span>
              <div className="chip-grid">
                {servers.map((server) => (
                  <label className="server-chip" key={`delete-${server.id}`}>
                    <input
                      type="checkbox"
                      checked={deleteForm.server_ids.includes(server.id)}
                      onChange={() => toggleDeleteServer(server.id)}
                    />
                    <span>{server.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="danger">
              Удалить пользователя
            </button>
          </form>
        </article>

        {results ? (
          <article className="panel">
            <h2>Результаты операции</h2>
            <div className="result-stack">
              {results.results.map((result, index) => (
                <article className="result-card" key={`${result.server_id}-${result.username}-${index}`}>
                  <div className="server-card-row">
                    <strong>{result.server_name}</strong>
                    <span className={`status-pill ${result.ok ? "online" : "offline"}`}>
                      {result.ok ? "успешно" : "ошибка"}
                    </span>
                  </div>
                  <code>
                    {result.action === "create" ? "Создание" : "Удаление"} пользователя: {result.username}
                  </code>
                  <p>{result.message}</p>
                  {result.stderr ? <pre className="stderr">{result.stderr}</pre> : null}
                </article>
              ))}
            </div>
          </article>
        ) : null}
      </section>
    </div>
  );
}

export default UsersPage;

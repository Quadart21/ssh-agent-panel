import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api";
import type { ServerAccess } from "../../types";

type Props = {
  serverId: number;
  serverName: string;
  anchorRect: DOMRect | null;
  pinned: boolean;
  canConvert: boolean;
  onClose: () => void;
  onPin: () => void;
  onKeepOpen: () => void;
  onScheduleClose: () => void;
  onConverted: () => void;
  onError: (message: string) => void;
};

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

function SshAccessPopover({
  serverId,
  serverName,
  anchorRect,
  pinned,
  canConvert,
  onClose,
  onPin,
  onKeepOpen,
  onScheduleClose,
  onConverted,
  onError
}: Props) {
  const [access, setAccess] = useState<ServerAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setAccess(null);
    void api
      .getServerAccess(serverId)
      .then((data) => {
        if (!cancelled) {
          setAccess(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Не удалось загрузить SSH-доступ.";
          setLoadError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [pinned, onClose]);

  async function handleConvert() {
    if (!window.confirm(`Сгенерировать SSH-ключ для «${serverName}», установить на сервер и удалить пароль из панели?`)) {
      return;
    }
    setConverting(true);
    onError("");
    try {
      const result = await api.convertServerToKey(serverId);
      setAccess((current) =>
        current
          ? {
              ...current,
              auth_method: "key",
              password: null,
              private_key: result.private_key,
              public_key: result.public_key,
              key_fingerprint: result.key_fingerprint,
              ssh_command_with_key: result.ssh_command
            }
          : current
      );
      onConverted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось перевести сервер на ключ.");
    } finally {
      setConverting(false);
    }
  }

  function handleCopy(field: string, value: string) {
    copyText(value);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1200);
  }

  if (!anchorRect) {
    return null;
  }

  const top = Math.min(window.innerHeight - 24, anchorRect.bottom + 10);
  const left = Math.min(window.innerWidth - 360, Math.max(16, anchorRect.left));

  return (
    <div
      ref={popoverRef}
      className={`ssh-access-popover ${pinned ? "pinned" : ""}`}
      style={{ top, left }}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onScheduleClose}
      onClick={onPin}
    >
      <div className="ssh-access-popover-head">
        <div>
          <strong>{serverName}</strong>
          <p className="muted">SSH-доступ</p>
        </div>
        <button type="button" className="ghost btn-sm" onClick={onClose}>
          Закрыть
        </button>
      </div>

      {loading ? <p className="muted">Загрузка данных доступа...</p> : null}
      {!loading && loadError ? <p className="danger-note">{loadError}</p> : null}

      {!loading && !loadError && access ? (
        <div className="ssh-access-popover-body">
          <div className="ssh-access-row">
            <span>Хост</span>
            <code>{access.ip}:{access.port}</code>
            <button type="button" className="ghost btn-sm" onClick={() => handleCopy("host", `${access.ip}:${access.port}`)}>
              {copiedField === "host" ? "OK" : "Copy"}
            </button>
          </div>
          <div className="ssh-access-row">
            <span>Логин</span>
            <code>{access.login}</code>
            <button type="button" className="ghost btn-sm" onClick={() => handleCopy("login", access.login)}>
              {copiedField === "login" ? "OK" : "Copy"}
            </button>
          </div>
          <div className="ssh-access-row">
            <span>Метод</span>
            <span className={`status-pill ${access.auth_method === "key" ? "online" : "offline"}`}>
              {access.auth_method === "key" ? "ключ" : access.auth_method === "password" ? "пароль" : "не задан"}
            </span>
          </div>

          {access.password ? (
            <div className="ssh-access-block">
              <div className="ssh-access-row">
                <span>Пароль</span>
                <button type="button" className="ghost btn-sm" onClick={() => handleCopy("password", access.password ?? "")}>
                  {copiedField === "password" ? "Скопировано" : "Скопировать пароль"}
                </button>
              </div>
            </div>
          ) : null}

          {access.private_key ? (
            <div className="ssh-access-block">
              <div className="ssh-access-row">
                <span>Приватный ключ</span>
                <button type="button" className="ghost btn-sm" onClick={() => handleCopy("private_key", access.private_key ?? "")}>
                  {copiedField === "private_key" ? "Скопировано" : "Скопировать ключ"}
                </button>
              </div>
              {access.key_fingerprint ? <p className="muted ssh-access-hint">Fingerprint: {access.key_fingerprint}</p> : null}
            </div>
          ) : null}

          <div className="ssh-access-block">
            <div className="ssh-access-row">
              <span>Команда</span>
              <button
                type="button"
                className="ghost btn-sm"
                onClick={() => handleCopy("ssh", access.ssh_command_with_key ?? access.ssh_command)}
              >
                {copiedField === "ssh" ? "Скопировано" : "Copy"}
              </button>
            </div>
            <code className="ssh-access-command">{access.ssh_command_with_key ?? access.ssh_command}</code>
          </div>

          <div className="ssh-access-actions">
            <Link to={`/terminal?server=${serverId}`} className="button-link">
              Открыть терминал
            </Link>
            {canConvert && access.auth_method === "password" ? (
              <button type="button" className="ghost" disabled={converting} onClick={() => void handleConvert()}>
                {converting ? "Генерация..." : "Перевести на ключ"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SshAccessPopover;

import { useState } from "react";

import { api } from "../api";

type Props = {
  onError: (message: string) => void;
};

function SystemPage({ onError }: Props) {
  const [message, setMessage] = useState("Здесь доступны резервные копии и восстановление панели.");
  const [backupFile, setBackupFile] = useState<File | null>(null);

  async function handleDownloadBackup() {
    onError("");
    try {
      const blob = await api.downloadBackup();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gui_ssh_backup.json";
      link.click();
      window.URL.revokeObjectURL(url);
      setMessage("Резервная копия успешно выгружена.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось выгрузить резервную копию.");
    }
  }

  async function handleImportBackup() {
    if (!backupFile) {
      onError("Сначала выберите JSON-файл резервной копии.");
      return;
    }
    onError("");
    try {
      const response = await api.importBackup(backupFile);
      setMessage(response.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось восстановить резервную копию.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Система</p>
          <h1>Резервные копии и обслуживание</h1>
          <p className="hero-copy">{message}</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <h2>Экспорт резервной копии</h2>
          <p className="muted">Сохраняет основные настройки панели, серверы, группы, шаблоны, пользователей и 2FA.</p>
          <button type="button" onClick={() => void handleDownloadBackup()}>
            Скачать backup
          </button>
        </article>

        <article className="panel">
          <h2>Восстановление из backup</h2>
          <p className="muted">Осторожно: восстановление заменяет текущие данные панели содержимым файла.</p>
          <div className="compact-form">
            <input type="file" accept=".json,application/json" onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} />
            <button type="button" className="danger" onClick={() => void handleImportBackup()}>
              Восстановить backup
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

export default SystemPage;

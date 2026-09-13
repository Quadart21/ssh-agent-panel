import { useState } from "react";

import { api } from "../api";
import { PageHero, PageShell, Panel } from "./ui";

type Props = {
  onError: (message: string) => void;
};

function SystemPage({ onError }: Props) {
  const [message, setMessage] = useState("Резервные копии и восстановление панели.");
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
    <PageShell>
      <PageHero eyebrow="Администрирование" title="Система" description={message} />

      <section className="dashboard-grid">
        <Panel title="Экспорт" description="Серверы, группы, шаблоны, пользователи и 2FA.">
          <button type="button" onClick={() => void handleDownloadBackup()}>
            Скачать backup
          </button>
        </Panel>

        <Panel title="Восстановление" description="Заменяет текущие данные панели содержимым файла.">
          <div className="compact-form">
            <input type="file" accept=".json,application/json" onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} />
            <button type="button" className="danger" onClick={() => void handleImportBackup()}>
              Восстановить backup
            </button>
          </div>
        </Panel>
      </section>
    </PageShell>
  );
}

export default SystemPage;

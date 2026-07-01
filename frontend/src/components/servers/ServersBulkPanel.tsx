import type { Group } from "../../types";

type Props = {
  groups: Group[];
  bulkInput: string;
  setBulkInput: (value: string) => void;
  bulkGroupId: string;
  setBulkGroupId: (value: string) => void;
  onBulkCreate: () => void;
  bulkStatus: string;
  bulkBusy: boolean;
  onImportFilezilla: (file: File) => void;
  filezillaImporting: boolean;
  canCreate: boolean;
};

function ServersBulkPanel({
  groups,
  bulkInput,
  setBulkInput,
  bulkGroupId,
  setBulkGroupId,
  onBulkCreate,
  bulkStatus,
  bulkBusy,
  onImportFilezilla,
  filezillaImporting,
  canCreate
}: Props) {
  return (
    <article className="panel servers-bulk-panel">
      <div className="panel-head">
        <div>
          <h2>Массовый импорт</h2>
          <p className="muted">
            Добавьте несколько узлов одной пачкой. Серверы с тем же IP и портом пропускаются. Для новых строк
            выполняется проверка SSH и автоматическая установка агента.
          </p>
        </div>
      </div>

      <div className="bulk-options">
        <label>
          Группа для всех серверов
          <select
            value={bulkGroupId}
            onChange={(event) => setBulkGroupId(event.target.value)}
            disabled={!canCreate || bulkBusy}
          >
            <option value="">Без группы</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Выбранная группа применится ко всем импортируемым серверам. Если в строке указана своя группа — она имеет
          приоритет.
        </p>
      </div>

      <div className="bulk-format-card">
        <strong>Импорт из FileZilla</strong>
        <p className="muted">
          Загрузите XML из FileZilla Site Manager (Файл → Экспорт). Папки станут группами, серверы с тем же IP и
          портом пропускаются.
        </p>
        <div className="compact-form">
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            disabled={!canCreate || bulkBusy || filezillaImporting}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (selected) {
                onImportFilezilla(selected);
              }
            }}
          />
          {filezillaImporting ? <p className="muted">Импортируем FileZilla XML…</p> : null}
        </div>
      </div>

      <div className="bulk-format-card">
        <strong>Формат строки</strong>
        <code>name;ip;login;password;port;group</code>
        <p className="muted">
          Порт и группа в строке необязательны. Группа в строке — id или название из раздела «Группы».
        </p>
      </div>

      <textarea
        rows={12}
        value={bulkInput}
        onChange={(event) => setBulkInput(event.target.value)}
        placeholder={"srv-1;1.2.3.4;root;pass123;22\nsrv-2;5.6.7.8;root;pass456\nsrv-3;10.0.0.5;deploy;secret;2222;Бот/кабинет"}
        disabled={!canCreate || bulkBusy}
      />

      <div className="compact-form">
        <button type="button" onClick={onBulkCreate} disabled={!canCreate || bulkBusy}>
          {bulkBusy ? "Импортируем…" : "Импортировать серверы"}
        </button>
        {bulkStatus ? <p className="muted">{bulkStatus}</p> : null}
        {!canCreate ? <p className="muted">Нужно право «создание серверов» для массового импорта.</p> : null}
      </div>
    </article>
  );
}

export default ServersBulkPanel;

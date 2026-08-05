import type { Group } from "../../types";
import { Panel } from "../ui";

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
    <div className="bulk-paths">
      <Panel title="Вставить список" description="Формат: name;ip;login;password;port;group">
        <label>
          Группа по умолчанию
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
        <p className="muted">Группа в строке имеет приоритет. Дубликаты по IP:порт пропускаются.</p>
        <textarea
          rows={12}
          value={bulkInput}
          onChange={(event) => setBulkInput(event.target.value)}
          placeholder={"srv-1;1.2.3.4;root;pass123;22\nsrv-2;5.6.7.8;root;pass456"}
          disabled={!canCreate || bulkBusy}
        />
        <div className="compact-form">
          <button type="button" onClick={onBulkCreate} disabled={!canCreate || bulkBusy}>
            {bulkBusy ? "Импортируем…" : "Импортировать"}
          </button>
          {bulkStatus ? <p className="muted">{bulkStatus}</p> : null}
          {!canCreate ? <p className="muted">Нужно право на создание серверов.</p> : null}
        </div>
      </Panel>

      <Panel title="FileZilla XML" description="Экспорт Site Manager → Файл → Экспорт">
        <p className="muted">Папки станут группами. Серверы с тем же IP и портом пропускаются.</p>
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
          {filezillaImporting ? <p className="muted">Импортируем…</p> : null}
        </div>
      </Panel>
    </div>
  );
}

export default ServersBulkPanel;

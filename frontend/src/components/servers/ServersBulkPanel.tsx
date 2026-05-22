type Props = {
  bulkInput: string;
  setBulkInput: (value: string) => void;
  onBulkCreate: () => void;
  bulkStatus: string;
  bulkBusy: boolean;
  canCreate: boolean;
};

function ServersBulkPanel({ bulkInput, setBulkInput, onBulkCreate, bulkStatus, bulkBusy, canCreate }: Props) {
  return (
    <article className="panel servers-bulk-panel">
      <div className="panel-head">
        <div>
          <h2>Массовый импорт</h2>
          <p className="muted">
            Добавьте несколько узлов одной пачкой. Для каждой строки будет выполнена проверка SSH и автоматическая
            установка агента.
          </p>
        </div>
      </div>

      <div className="bulk-format-card">
        <strong>Формат строки</strong>
        <code>name;ip;login;password;port;group</code>
        <p className="muted">
          Порт и группа необязательны. Группа — id или название из раздела «Группы».
        </p>
      </div>

      <textarea
        rows={12}
        value={bulkInput}
        onChange={(event) => setBulkInput(event.target.value)}
        placeholder={"srv-1;1.2.3.4;root;pass123;22;Бот/кабинет\nsrv-2;5.6.7.8;root;pass456\nsrv-3;10.0.0.5;deploy;secret;2222;2"}
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

import type { FormEvent } from "react";

type FormState = {
  appName: string;
  script: string;
  instances: string;
  cwd: string;
  interpreter: string;
  scriptArgs: string;
};

type Props = {
  form: FormState;
  setForm: (next: FormState) => void;
  disabled: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function Pm2StartForm({ form, setForm, disabled, busy, onSubmit }: Props) {
  return (
    <section className="panel pm2-start-panel">
      <div className="panel-head">
        <div>
          <h2>Запуск</h2>
          <p className="muted">Добавить процесс в PM2 на выбранном сервере.</p>
        </div>
      </div>
      <form className="pm2-start-form" onSubmit={onSubmit}>
        <label>
          Имя
          <input
            value={form.appName}
            onChange={(event) => setForm({ ...form, appName: event.target.value })}
            placeholder="api-worker"
            required
            disabled={disabled || busy}
          />
        </label>
        <label>
          Скрипт / бинарник
          <input
            value={form.script}
            onChange={(event) => setForm({ ...form, script: event.target.value })}
            placeholder="/var/app/main.js или app.py"
            required
            disabled={disabled || busy}
          />
        </label>
        <label>
          Инстансы
          <input
            type="number"
            min={1}
            max={64}
            value={form.instances}
            onChange={(event) => setForm({ ...form, instances: event.target.value })}
            disabled={disabled || busy}
          />
        </label>
        <label>
          Interpreter
          <input
            value={form.interpreter}
            onChange={(event) => setForm({ ...form, interpreter: event.target.value })}
            placeholder="python3 / путь к venv (опц.)"
            disabled={disabled || busy}
          />
        </label>
        <label>
          cwd
          <input
            value={form.cwd}
            onChange={(event) => setForm({ ...form, cwd: event.target.value })}
            placeholder="/var/www/app"
            disabled={disabled || busy}
          />
        </label>
        <label>
          Аргументы после --
          <input
            value={form.scriptArgs}
            onChange={(event) => setForm({ ...form, scriptArgs: event.target.value })}
            placeholder="start"
            disabled={disabled || busy}
          />
        </label>
        <div className="pm2-start-actions">
          <button type="submit" disabled={disabled || busy}>
            {busy ? "Запуск…" : "Запустить"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default Pm2StartForm;

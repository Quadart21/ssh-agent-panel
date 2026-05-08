import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api";
import type { TwoFactorRecoveryCodes, TwoFactorSetup, TwoFactorStatus } from "../types";

type Props = {
  onError: (message: string) => void;
};

function TwoFactorPage({ onError }: Props) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<TwoFactorRecoveryCodes | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableOtpCode, setDisableOtpCode] = useState("");
  const [disableRecoveryCode, setDisableRecoveryCode] = useState("");
  const [message, setMessage] = useState("Здесь можно включить 2FA через Google Authenticator или другое TOTP-приложение.");

  async function loadStatus() {
    onError("");
    try {
      const data = await api.twoFactorStatus();
      setStatus(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить статус 2FA.");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleSetup() {
    onError("");
    try {
      const data = await api.twoFactorSetup();
      setSetup(data);
      setRecoveryCodes({ recovery_codes: data.recovery_codes });
      setMessage("Сканируйте секрет в приложении и подтвердите 6-значным кодом.");
      await loadStatus();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось создать настройку 2FA.");
    }
  }

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      const data = await api.twoFactorEnable({ otp_code: otpCode });
      setStatus(data);
      setMessage("2FA включена.");
      setOtpCode("");
      await loadStatus();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось включить 2FA.");
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    try {
      const data = await api.twoFactorDisable({
        password: disablePassword,
        otp_code: disableOtpCode || null,
        recovery_code: disableRecoveryCode || null
      });
      setStatus(data);
      setSetup(null);
      setRecoveryCodes(null);
      setDisablePassword("");
      setDisableOtpCode("");
      setDisableRecoveryCode("");
      setMessage("2FA отключена.");
      await loadStatus();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось отключить 2FA.");
    }
  }

  async function handleRegenerateRecoveryCodes() {
    onError("");
    try {
      const data = await api.regenerateRecoveryCodes();
      setRecoveryCodes(data);
      setMessage("Recovery-коды обновлены. Сохраните их в надёжном месте.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось обновить recovery-коды.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">2FA</p>
          <h1>Двухфакторная авторизация</h1>
          <p className="hero-copy">{message}</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Статус 2FA</h2>
            <span className={`status-pill ${status?.enabled ? "online" : "offline"}`}>
              {status?.enabled ? "включена" : "выключена"}
            </span>
          </div>

          {!status?.enabled ? (
            <div className="compact-form">
              <button type="button" onClick={() => void handleSetup()}>
                Создать настройку 2FA
              </button>
            </div>
          ) : null}

          {setup ? (
            <div className="mini-card">
              <strong>QR-код для приложения</strong>
              <div className="two-factor-qr" dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
              <strong>Секрет для приложения</strong>
              <pre>{setup.secret}</pre>
              <strong>otpauth URL</strong>
              <pre>{setup.otpauth_url}</pre>
            </div>
          ) : null}

          {setup && !status?.enabled ? (
            <form className="compact-form" onSubmit={handleEnable}>
              <label>
                Код из приложения
                <input value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="123456" required />
              </label>
              <button type="submit">Включить 2FA</button>
            </form>
          ) : null}
        </article>

        <article className="panel">
          <h2>Recovery-коды</h2>
          {recoveryCodes ? (
            <div className="mini-card">
              <pre>{recoveryCodes.recovery_codes.join("\n")}</pre>
            </div>
          ) : (
            <p className="muted">Recovery-коды появятся после создания или обновления 2FA.</p>
          )}

          {status?.enabled ? (
            <div className="compact-form">
              <button type="button" className="ghost" onClick={() => void handleRegenerateRecoveryCodes()}>
                Сгенерировать новые recovery-коды
              </button>
            </div>
          ) : null}
        </article>
      </section>

      {status?.enabled ? (
        <article className="panel">
          <h2>Отключить 2FA</h2>
          <form className="form-grid" onSubmit={handleDisable}>
            <label className="full-width">
              Текущий пароль
              <input
                type="password"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
                required
              />
            </label>
            <label>
              Код 2FA
              <input value={disableOtpCode} onChange={(event) => setDisableOtpCode(event.target.value)} placeholder="123456" />
            </label>
            <label>
              Или recovery-код
              <input
                value={disableRecoveryCode}
                onChange={(event) => setDisableRecoveryCode(event.target.value)}
                placeholder="Например ab12cd34"
              />
            </label>
            <button type="submit" className="danger">
              Отключить 2FA
            </button>
          </form>
        </article>
      ) : null}
    </div>
  );
}

export default TwoFactorPage;

import { FormEvent, useState } from "react";

type Props = {
  onLogin: (email: string, password: string, otpCode?: string, recoveryCode?: string) => Promise<void>;
  error: string;
};

function LoginPage({ onLogin, error }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await onLogin(email, password, useRecoveryCode ? undefined : otpCode, useRecoveryCode ? recoveryCode : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Авторизация</p>
        <h1>Вход в панель управления</h1>
        <p className="hero-copy">
          Используйте учетную запись администратора, заданную в `backend/.env`, или данные существующего пользователя панели.
        </p>
        {error ? <div className="banner error">{error}</div> : null}
        <form className="compact-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@ssh.norenvpn.com" required />
          </label>
          <label>
            Пароль
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          <label>
            {useRecoveryCode ? "Recovery-код" : "Код 2FA"}
            <input
              value={useRecoveryCode ? recoveryCode : otpCode}
              onChange={(event) => (useRecoveryCode ? setRecoveryCode(event.target.value) : setOtpCode(event.target.value))}
              type="text"
              placeholder={useRecoveryCode ? "Введите recovery-код" : "Введите 6-значный код, если 2FA включена"}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useRecoveryCode}
              onChange={(event) => setUseRecoveryCode(event.target.checked)}
            />
            Использовать recovery-код вместо TOTP
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;

import { FormEvent, useState } from "react";

type Props = {
  email: string;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  error: string;
};

function PasswordChangePage({ email, onSubmit, error }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (newPassword !== confirmPassword) {
      setLocalError("Новый пароль и подтверждение не совпадают.");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Безопасность</p>
        <h1>Нужно изменить пароль</h1>
        <p className="hero-copy">
          Для пользователя <strong>{email}</strong> требуется смена стартового или сброшенного пароля перед продолжением работы.
        </p>
        {error ? <div className="banner error">{error}</div> : null}
        {localError ? <div className="banner error">{localError}</div> : null}
        <form className="compact-form" onSubmit={handleSubmit}>
          <label>
            Текущий пароль
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </label>
          <label>
            Новый пароль
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </label>
          <label>
            Подтверждение нового пароля
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>
          <p className="muted">Минимум 10 символов, строчные и заглавные буквы, цифра и спецсимвол.</p>
          <button type="submit" disabled={loading}>
            {loading ? "Сохраняем..." : "Изменить пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PasswordChangePage;

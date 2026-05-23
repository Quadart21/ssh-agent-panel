import type { User } from "../types";

type Props = {
  topBarTitle: string;
  currentUser: User | null;
  onLogout: () => void;
  showMobileBar?: boolean;
};

function AppChrome({ topBarTitle, currentUser, onLogout, showMobileBar = false }: Props) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        К основному содержимому
      </a>

      <header className={`top-bar ${showMobileBar ? "top-bar--mobile" : ""}`}>
        <div className="top-bar-brand">
          <span className="top-bar-brand-mark" aria-hidden>
            SSH
          </span>
          <span className="top-bar-title">{topBarTitle}</span>
        </div>
        {currentUser ? (
          <div className="top-bar-actions">
            <div className="top-bar-user">
              <strong>{currentUser.full_name}</strong>
              <span>{currentUser.role}</span>
            </div>
            <button type="button" className="ghost btn-sm top-bar-logout" onClick={() => void onLogout()}>
              Выйти
            </button>
          </div>
        ) : null}
      </header>
    </>
  );
}

export default AppChrome;

type Props = {
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  onCloseMobileNav: () => void;
  topBarTitle: string;
};

function AppChrome({ mobileNavOpen, onToggleMobileNav, onCloseMobileNav, topBarTitle }: Props) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        К основному содержимому
      </a>

      <header className="top-bar">
        <button
          type="button"
          className="icon-btn menu-toggle"
          aria-expanded={mobileNavOpen}
          aria-controls="app-sidebar"
          onClick={onToggleMobileNav}
        >
          <span className="sr-only">{mobileNavOpen ? "Закрыть меню" : "Открыть меню"}</span>
          <span className="menu-icon" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
        <span className="top-bar-title">{topBarTitle}</span>
      </header>

      {mobileNavOpen ? (
        <button type="button" className="nav-backdrop" aria-label="Закрыть меню навигации" onClick={onCloseMobileNav} />
      ) : null}
    </>
  );
}

export default AppChrome;

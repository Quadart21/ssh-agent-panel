import type { SectionItem } from "../navigation";
import type { User } from "../types";
import SubnavStrip from "./SubnavStrip";

type Props = {
  topBarTitle: string;
  currentUser: User | null;
  onLogout: () => void;
  sections: SectionItem[];
};

function MobileHeader({ topBarTitle, currentUser, onLogout, sections }: Props) {
  return (
    <div className="mobile-header">
      <header className="top-bar top-bar--mobile">
        <div className="top-bar-brand">
          <span className="top-bar-brand-mark brand-mark" aria-hidden>
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
      <SubnavStrip sections={sections} variant="compact" />
    </div>
  );
}

export default MobileHeader;

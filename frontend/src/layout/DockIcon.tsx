type Props = {
  name: "overview" | "infrastructure" | "operations" | "security" | "administration";
};

function DockIcon({ name }: Props) {
  switch (name) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm8 0h8v-9h-8v9zm0-16v5h8V4h-8z" />
        </svg>
      );
    case "infrastructure":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 6h16v4H4V6zm0 6h10v4H4v-4zm12 0h4v4h-4v-4z" />
        </svg>
      );
    case "operations":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      );
    case "security":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm0 2.2 6 2.25V11c0 3.8-2.5 7.4-6 8.7-3.5-1.3-6-4.9-6-8.7V6.45l6-2.25z" />
        </svg>
      );
    case "administration":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3a7.94 7.94 0 0 1 0 2 7.94 7.94 0 0 1 0 2l2.03 1.58a.5.5 0 0 1 .12.64l-1.92 3.32a.5.5 0 0 1-.6.22l-2.39-.96a8.05 8.05 0 0 1-1.73 1l-.36 2.54a.5.5 0 0 1-.5.42h-3.84a.5.5 0 0 1-.5-.42l-.36-2.54a8.05 8.05 0 0 1-1.73-1l-2.39.96a.5.5 0 0 1-.6-.22L2.91 18.2a.5.5 0 0 1 .12-.64L5.06 16a7.94 7.94 0 0 1 0-2 7.94 7.94 0 0 1 0-2L2.03 10.4a.5.5 0 0 1-.12-.64l1.92-3.32a.5.5 0 0 1 .6-.22l2.39.96a8.05 8.05 0 0 1 1.73-1l.36-2.54A.5.5 0 0 1 11.16 2h3.84a.5.5 0 0 1 .5.42l.36 2.54a8.05 8.05 0 0 1 1.73 1l2.39-.96a.5.5 0 0 1 .6.22l1.92 3.32a.5.5 0 0 1-.12.64L19.94 12z" />
        </svg>
      );
  }
}

export default DockIcon;

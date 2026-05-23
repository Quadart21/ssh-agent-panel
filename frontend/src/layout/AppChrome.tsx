type Props = {
  topBarTitle: string;
};

function AppChrome({ topBarTitle }: Props) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        К основному содержимому
      </a>
      <span className="sr-only" aria-live="polite">
        {topBarTitle}
      </span>
    </>
  );
}

export default AppChrome;

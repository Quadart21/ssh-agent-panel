function PageFallback() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Загрузка раздела">
      <div className="skeleton-block skeleton-hero" />
      <div className="skeleton-grid">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    </div>
  );
}

export default PageFallback;

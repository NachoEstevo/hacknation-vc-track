import styles from "./route-state.module.css";

export default function InvestorLoading() {
  return (
    <main className={styles.statePage} aria-busy="true" aria-label="Loading workspace">
      <div className={styles.sidebarSkeleton} aria-hidden="true" />
      <div className={styles.loadingContent}>
        <span className={styles.loadingLabel}>Preparing the evidence workspace</span>
        <div className={styles.loadingTitle} aria-hidden="true" />
        <div className={styles.loadingGrid} aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </div>
    </main>
  );
}

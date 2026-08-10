import { PageSkeleton } from "@/components/feedback/skeletons";

export default function DashboardGroupLoading() {
  return (
    <div className="app-shell app-shell--loading">
      <div className="app-shell__desktop-sidebar" />
      <div className="app-shell__body">
        <div className="app-topbar app-topbar--skeleton" />
        <main className="content-container">
          <PageSkeleton />
        </main>
      </div>
    </div>
  );
}

import { AppLoader } from "@/components/feedback/app-loader";

export default function LoginLoading() {
  return (
    <main className="login-page login-page--loading">
      <AppLoader label="Preparando acesso" />
    </main>
  );
}

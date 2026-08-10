import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/constants/brand";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-panel" aria-labelledby="not-found-title">
        <Image src={BRAND.assets.lockupDark} alt="ALC Admin Center" width={248} height={80} priority />
        <div className="not-found-panel__content">
          <span>404</span>
          <h1 id="not-found-title">Página não encontrada</h1>
          <p>O endereço informado não existe ou não está disponível.</p>
        </div>
        <Link href="/dashboard" className="button button--primary button--md">
          <span>Voltar ao painel</span>
        </Link>
      </section>
    </main>
  );
}

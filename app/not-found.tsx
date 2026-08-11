import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/constants/brand";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-panel" aria-labelledby="not-found-title">
        <div className="not-found-panel__brand" aria-label={BRAND.productName}>
          <Image src={BRAND.assets.symbolLight} alt="" width={52} height={52} priority aria-hidden="true" />
          <strong>{BRAND.productName}</strong>
        </div>
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

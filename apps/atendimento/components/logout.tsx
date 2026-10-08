"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
export function Logout() {
  const router = useRouter();
  return (
    <button
      className="logout"
      onClick={async () => {
        const client = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        await client.auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sair da conta
    </button>
  );
}

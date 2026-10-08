import { Conversations } from "@/components/conversations";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const query = await searchParams;
  return <Conversations initialSelected={/^[0-9a-f-]{36}$/i.test(query.id || "") ? query.id : ""} initialChannel={["driver","client"].includes(query.channel || "") ? query.channel : "all"} initialView={["mine","uninteracted"].includes(query.view || "") ? query.view : "all"} initialStatus={["all","pending","resolved","human","bot"].includes(query.status || "") ? query.status : "open"} />;
}

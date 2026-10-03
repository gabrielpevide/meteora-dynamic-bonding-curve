import { TokenView } from "@/components/token/token-view";

export default async function TokenPage(props: PageProps<"/t/[mint]">) {
  const { mint } = await props.params;
  return <TokenView mint={mint} />;
}

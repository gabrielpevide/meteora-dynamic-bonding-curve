import { LaunchForm } from "@/components/launch/launch-form";

export const metadata = { title: "Launch a token · Diamond Hands" };

export default function LaunchPage() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="facet-bg absolute -bottom-[320px] -left-[18%] aspect-square w-[60%] max-w-[860px] bg-facet" />
      <div className="container-page relative flex flex-col gap-8 pb-24 pt-12">
        <div className="flex max-w-[720px] flex-col gap-3">
          <h1 className="font-display text-[clamp(36px,3.6vw,52px)] font-bold leading-[1.04]">Launch a token</h1>
          <p className="text-lg leading-relaxed text-body">One transaction. Your token trades on a Meteora bonding curve from the first block.</p>
        </div>
        <LaunchForm />
      </div>
    </div>
  );
}

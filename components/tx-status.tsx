import type { SendStatus } from "@/components/use-send";
import { explorerTx } from "@/lib/solana";

export function TxStatus({ status }: { status: SendStatus }) {
  if (status.kind === "idle") return null;
  if (status.kind === "pending") return <p className="text-sm text-muted">{status.step ?? "Waiting for your wallet…"}</p>;
  if (status.kind === "error") return <p className="break-words text-sm text-danger">{status.msg}</p>;
  return (
    <a href={explorerTx(status.sig)} target="_blank" rel="noreferrer" className="text-sm text-gain underline">
      Confirmed. View transaction
    </a>
  );
}

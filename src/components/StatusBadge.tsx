import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  "New Invoice": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Pending Approval": "bg-orange-100 text-orange-800 border-orange-200",
  Approved: "bg-blue-100 text-blue-800 border-blue-200",
  "Pending Sachin's Approval in Melio":
    "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Pending Akshay's Approval in Melio":
    "bg-yellow-100 text-yellow-800 border-yellow-200",
  Done: "bg-emerald-600 text-white border-emerald-700 font-bold",
};

export function StatusBadge({ status }: { status: string }) {
  const styles =
    STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles,
      )}
    >
      {status || "—"}
    </span>
  );
}

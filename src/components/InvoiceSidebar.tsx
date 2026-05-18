import { useMemo } from "react";
import { RefreshCw, AlertCircle, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InvoiceRow } from "@/lib/types";
import {
  formatChicagoTime,
  formatGroupLabel,
  toChicagoDateKey,
} from "@/lib/time";
import { invoiceKey } from "@/lib/sheets";

interface InvoiceSidebarProps {
  invoices: InvoiceRow[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  onRefresh: () => void;
  activeKey: string | null;
  onSelect: (key: string, dateKey: string) => void;
  completedKeys: Set<string>;
  onLogout?: () => void;
  onManualUpload?: () => void;
}

interface InvoiceEntry {
  key: string;
  invoice: InvoiceRow;
  seqNo: number;
}

interface DateGroup {
  dateKey: string;
  label: string;
  entries: InvoiceEntry[];
  allDone: boolean;
}

export function InvoiceSidebar({
  invoices,
  loading,
  error,
  lastUpdated,
  onRefresh,
  activeKey,
  onSelect,
  completedKeys,
  onLogout,
  onManualUpload,
}: InvoiceSidebarProps) {
  const groups: DateGroup[] = useMemo(() => {
    const byDate = new Map<string, InvoiceRow[]>();
    for (const inv of invoices) {
      if (!inv.timestamp) continue;
      const dk = toChicagoDateKey(new Date(inv.timestamp));
      if (!dk) continue;
      if (!byDate.has(dk)) byDate.set(dk, []);
      byDate.get(dk)!.push(inv);
    }

    const arr: DateGroup[] = [];
    for (const [dateKey, rows] of byDate.entries()) {
      // Sort oldest-first for consistent sequential numbering
      const sorted = [...rows].sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : 1,
      );
      const entries: InvoiceEntry[] = sorted.map((inv, i) => ({
        key: invoiceKey(inv),
        invoice: inv,
        seqNo: i + 1,
      }));
      const allDone = entries.every(
        (e) =>
          completedKeys.has(e.key) || e.invoice.finalStatus === "Done",
      );
      arr.push({
        dateKey,
        label: formatGroupLabel(dateKey),
        entries,
        allDone,
      });
    }
    arr.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    return arr;
  }, [invoices, completedKeys]);

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">
            Invoices
          </div>
          {lastUpdated && (
            <div className="text-[10px] text-muted-foreground">
              Updated {formatChicagoTime(lastUpdated)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onManualUpload && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onManualUpload}
              aria-label="Upload manual invoice"
              title="Upload manual invoice"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          {onLogout && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {error && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {loading && invoices.length === 0 && (
            <div className="space-y-3 px-1 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                </div>
              ))}
            </div>
          )}

          {!loading && groups.length === 0 && !error && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No invoices yet.
            </div>
          )}

          {groups.map((group) => (
            <div key={group.dateKey} className="mb-3">
              <div
                className={cn(
                  "px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                  group.allDone && "line-through opacity-50",
                )}
              >
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.entries.map((entry) => {
                  const active = activeKey === entry.key;
                  const done =
                    completedKeys.has(entry.key) ||
                    entry.invoice.finalStatus === "Done";
                  return (
                    <li key={entry.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(entry.key, group.dateKey)}
                        className={cn(
                          "flex w-full items-start gap-1.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-xs transition-colors",
                          active
                            ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "hover:bg-sidebar-accent/50 text-sidebar-foreground",
                          done && !active && "opacity-50",
                        )}
                      >
                        {/* Sequential counter */}
                        <span className="mt-px shrink-0 font-mono text-[10px] text-muted-foreground">
                          {entry.seqNo}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1",
                            done && "line-through",
                          )}
                        >
                          <span className="block truncate font-medium">
                            #{entry.invoice.invoiceNumber}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {entry.invoice.community}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

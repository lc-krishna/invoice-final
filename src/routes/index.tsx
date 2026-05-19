import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Toaster } from "@/components/ui/sonner";
import { LoginScreen } from "@/components/LoginScreen";
import { isAuthed, logout } from "@/lib/auth";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InvoiceSidebar } from "@/components/InvoiceSidebar";
import { InvoiceForm } from "@/components/InvoiceForm";
import { PdfPreview } from "@/components/PdfPreview";
import { ManualUploadModal } from "@/components/ManualUploadModal";
import { fetchInvoices, invoiceKey } from "@/lib/sheets";
import type { InvoiceRow, InvoiceState } from "@/lib/types";
import { toChicagoDateKey } from "@/lib/time";
import { truncate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

const COMPLETED_STORAGE_KEY = "invoice-flow-completed";

function emptyState(): InvoiceState {
  return {
    driveFolderId: null,
    driveFolderName: "",
    driveBreadcrumb: [],
    driveVendorFileId: "",
    driveVendorFileLink: "",
    jobDescription: "",
    driveSubmitted: false,
    driveLoading: false,
    driveError: null,
    manualCommunity: "",
    manualVendor: "",
    manualInvoiceNumber: "",
    manualAmount: "",
    manualPaymentMethod: "",
    rmVendorId: null,
    rmVendorName: "",
    rmBankId: null,
    rmPayMethod: "ACH",
    rmMemo: "",
    rmDueDate: format(new Date(), "yyyy-MM-dd"),
    billDetails: [],
    rmSubmitted: false,
    rmLoading: false,
    rmError: null,
    rmBusinessRuleError: null,
    rmBillId: "",
    doneSubmitted: false,
    doneLoading: false,
    doneError: null,
  };
}

function loadCompletedKeys(): Set<string> {
  try {
    const stored = localStorage.getItem(COMPLETED_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function DashboardPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    isAuthed().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  if (authed == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading invoice dashboard...
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

  return (
    <Dashboard
      onLogout={async () => {
        await logout();
        setAuthed(false);
      }}
    />
  );
}

interface DashboardProps {
  onLogout: () => void;
}

function Dashboard({ onLogout }: DashboardProps) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const [manualUploadOpen, setManualUploadOpen] = useState(false);

  // Per-invoice form state, keyed by invoice key (rowNumber based)
  const [stateMap, setStateMap] = useState<Map<string, InvoiceState>>(new Map());

  // Completed invoice keys — persisted to localStorage
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(loadCompletedKeys);

  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const rows = await fetchInvoices();
      setInvoices(rows);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Failed to load invoices", { description: msg });
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  // Initial fetch + 30s polling
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Sync completedKeys from invoice sheet data + in-session RM submissions
  useEffect(() => {
    setCompletedKeys((prev) => {
      const merged = new Set(prev);
      let changed = false;
      for (const inv of invoices) {
        if (inv.finalStatus === "Done") {
          const k = invoiceKey(inv);
          if (!merged.has(k)) { merged.add(k); changed = true; }
        }
      }
      for (const [k, s] of stateMap) {
        if (s.rmSubmitted && !merged.has(k)) { merged.add(k); changed = true; }
      }
      if (!changed) return prev;
      localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([...merged]));
      return merged;
    });
  }, [stateMap, invoices]);

  // Auto-select the most recent invoice on first load.
  useEffect(() => {
    if (activeKey) return;
    if (invoices.length === 0) return;
    const sorted = [...invoices].sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : -1,
    );
    const first = sorted[0];
    const dk = first.timestamp ? toChicagoDateKey(new Date(first.timestamp)) : null;
    if (dk) {
      setSelectedDateKey(dk);
      setActiveKey(invoiceKey(first));
    }
  }, [invoices, activeKey]);

  // Invoices in the active date group (all communities, sorted oldest-first)
  const groupInvoices = useMemo(() => {
    if (!selectedDateKey) return [];
    return invoices
      .filter((inv) => {
        if (!inv.timestamp) return false;
        return toChicagoDateKey(new Date(inv.timestamp)) === selectedDateKey;
      })
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  }, [invoices, selectedDateKey]);

  // Ensure activeKey stays valid when the group changes
  useEffect(() => {
    if (groupInvoices.length === 0) {
      setActiveKey(null);
      return;
    }
    const keys = groupInvoices.map(invoiceKey);
    if (!activeKey || !keys.includes(activeKey)) {
      setActiveKey(keys[0]);
    }
  }, [groupInvoices, activeKey]);

  const activeInvoice = useMemo(
    () => groupInvoices.find((i) => invoiceKey(i) === activeKey) ?? null,
    [groupInvoices, activeKey],
  );

  const getInvoiceState = useCallback(
    (key: string): InvoiceState => stateMap.get(key) ?? emptyState(),
    [stateMap],
  );

  const updateInvoiceState = useCallback(
    (key: string, updater: (prev: InvoiceState) => InvoiceState) => {
      setStateMap((prev) => {
        const next = new Map(prev);
        const cur = next.get(key) ?? emptyState();
        next.set(key, updater(cur));
        return next;
      });
    },
    [],
  );

  const onSelectInvoice = useCallback((key: string, dateKey: string) => {
    setSelectedDateKey(dateKey);
    setActiveKey(key);
  }, []);

  // Called when a manual invoice is created via the upload modal
  const onInvoiceDeleted = useCallback((inv: InvoiceRow) => {
    setInvoices((prev) => prev.filter((i) => i.rowNumber !== inv.rowNumber));
    if (activeKey === invoiceKey(inv)) setActiveKey(null);
  }, [activeKey]);

  const onInvoiceCreated = useCallback((inv: InvoiceRow) => {
    setInvoices((prev) => [inv, ...prev]);
    const dateKey = inv.timestamp
      ? toChicagoDateKey(new Date(inv.timestamp))
      : toChicagoDateKey(new Date());
    if (dateKey) {
      setSelectedDateKey(dateKey);
      setActiveKey(invoiceKey(inv));
    }
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <InvoiceSidebar
        invoices={invoices}
        loading={loading}
        error={error}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        activeKey={activeKey}
        onSelect={onSelectInvoice}
        completedKeys={completedKeys}
        onLogout={onLogout}
        onManualUpload={() => setManualUploadOpen(true)}
      />

      {/* Center column */}
      <section className="flex h-full w-[480px] shrink-0 flex-col border-r">
        {activeInvoice ? (
          <Tabs
            value={activeKey ?? undefined}
            onValueChange={(v) => setActiveKey(v)}
            className="flex h-full flex-col"
          >
            <div className="border-b bg-background">
              <ScrollArea className="w-full">
                <TabsList className="h-auto w-max gap-1 rounded-none bg-transparent p-2">
                  {groupInvoices.map((inv) => {
                    const key = invoiceKey(inv);
                    const s = getInvoiceState(key);
                    const completed =
                      inv.finalStatus === "Done" || s.doneSubmitted || completedKeys.has(key);
                    return (
                      <TabsTrigger
                        key={key}
                        value={key}
                        className={cn(
                          "h-7 gap-1.5 px-2.5 text-xs data-[state=active]:bg-muted",
                        )}
                      >
                        {completed && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        )}
                        <span className="font-medium">
                          {inv.source === "manual"
                            ? "Manual"
                            : truncate(inv.vendor, 14)}
                        </span>
                        {inv.invoiceNumber && (
                          <span className="text-muted-foreground">
                            #{inv.invoiceNumber}
                          </span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </ScrollArea>
            </div>

            {groupInvoices.map((inv) => {
              const key = invoiceKey(inv);
              return (
                <TabsContent
                  key={key}
                  value={key}
                  className="m-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                  forceMount
                >
                  <ScrollArea className="h-full">
                    <InvoiceForm
                      invoice={inv}
                      state={getInvoiceState(key)}
                      onStateChange={(updater) => updateInvoiceState(key, updater)}
                      onDeleted={onInvoiceDeleted}
                    />
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Select an invoice from the sidebar to get started.
          </div>
        )}
      </section>

      {/* Right column */}
      <PdfPreview invoice={activeInvoice} />

      <ManualUploadModal
        open={manualUploadOpen}
        onClose={() => setManualUploadOpen(false)}
        onCreated={onInvoiceCreated}
      />

      <Toaster richColors position="top-right" />
    </div>
  );
}

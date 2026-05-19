import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  Receipt,
  CheckCheck,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  BillDetailLine,
  InvoiceRow,
  InvoiceState,
  PayMethod,
} from "@/lib/types";
import {
  COMMUNITIES,
  GL_ACCOUNTS,
  RM_BANKS,
  RM_VENDORS,
  getCommunityByLabel,
  getUnitsForProperty,
} from "@/lib/configs";
import { SearchCombobox, type ComboOption } from "./SearchCombobox";
import { StatusBadge } from "./StatusBadge";
import { DriveFolderPicker } from "./DriveFolderPicker";
import { copyFile as copyDriveFile } from "@/lib/drive";
import { formatUSD } from "@/lib/format";
import { formatChicagoFull, toChicagoIso } from "@/lib/time";

interface InvoiceFormProps {
  invoice: InvoiceRow;
  state: InvoiceState;
  onStateChange: (updater: (prev: InvoiceState) => InvoiceState) => void;
}

function newLine(): BillDetailLine {
  return {
    id: crypto.randomUUID(),
    glAccountId: null,
    glAccountName: "",
    amount: "",
    unitId: null,
    unitName: "",
    comment: "",
  };
}

// Maps InvoiceRow back to a 25-element raw sheet row (cols A:Y, 0-indexed)
function invoiceRowToArray(inv: InvoiceRow): unknown[] {
  return [
    inv.serialNo,           // A 0
    inv.timestamp,          // B 1
    inv.community,          // C 2
    inv.communityAsanaGid,  // D 3
    inv.taskName,           // E 4
    inv.vendor,             // F 5
    inv.invoiceNumber,      // G 6
    inv.amount,             // H 7
    inv.paymentMethod,      // I 8
    inv.status,             // J 9
    inv.melioEmail,         // K 10
    inv.communityFolderId,  // L 11
    inv.driveFileId,        // M 12
    inv.rmBillId,           // N 13
    inv.rmBillUploadStatus, // O 14
    inv.rmBillUploadError,  // P 15
    inv.rmAttachmentStatus, // Q 16
    inv.rmAttachmentError,  // R 17
    inv.driveVendorFolderId,// S 18
    inv.driveVendorFileId,  // T 19
    inv.driveUploadStatus,  // U 20
    inv.driveUploadError,   // V 21
    inv.asanaTaskGid,       // W 22
    inv.asanaTaskUrl,       // X 23
    inv.finalStatus,        // Y 24
  ];
}

// Builds the fully backfilled 25-element row for manual Done submission
function buildManualRow(
  invoice: InvoiceRow,
  state: InvoiceState,
  communityConfig: ReturnType<typeof getCommunityByLabel>,
): unknown[] {
  const community = state.manualCommunity || invoice.community;
  const vendor = state.manualVendor || invoice.vendor;
  const invoiceNumber = state.manualInvoiceNumber || invoice.invoiceNumber;
  const amount = state.manualAmount ? Number(state.manualAmount) : invoice.amount;
  const paymentMethod = state.manualPaymentMethod || invoice.paymentMethod;

  return [
    invoice.serialNo,                                          // A 0
    invoice.timestamp,                                         // B 1
    community,                                                 // C 2
    invoice.communityAsanaGid,                                 // D 3
    state.jobDescription || invoice.taskName,                  // E 4
    vendor,                                                    // F 5
    invoiceNumber,                                             // G 6
    amount,                                                    // H 7
    paymentMethod,                                             // I 8
    "Done",                                                    // J 9
    communityConfig?.melioEmail || invoice.melioEmail || "",   // K 10
    communityConfig?.folderId || invoice.communityFolderId || "", // L 11
    invoice.driveFileId,                                       // M 12
    invoice.rmBillId,                                          // N 13
    invoice.rmBillUploadStatus,                                // O 14
    invoice.rmBillUploadError,                                 // P 15
    invoice.rmAttachmentStatus,                                // Q 16
    invoice.rmAttachmentError,                                 // R 17
    state.driveFolderId || "",                                 // S 18
    state.driveVendorFileId || "",                             // T 19
    state.driveVendorFileId ? "Uploaded" : "",                 // U 20
    "",                                                        // V 21
    invoice.asanaTaskGid,                                      // W 22
    invoice.asanaTaskUrl,                                      // X 23
    "Done",                                                    // Y 24
  ];
}

function slugify(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function computeFilename(
  community: string,
  vendor: string,
  jobDesc: string,
  invoiceNumber: string,
  amount: number,
): string {
  const dateStr = format(new Date(), "yyyy-MM-dd");
  const parts = [
    dateStr,
    slugify(community),
    slugify(vendor),
    slugify(jobDesc) || "NoDesc",
    slugify(invoiceNumber) || "NoInv",
    slugify(amount.toFixed(2)),
  ];
  return parts.join("_") + ".pdf";
}

export function InvoiceForm({
  invoice,
  state,
  onStateChange,
}: InvoiceFormProps) {
  const isManual = invoice.source === "manual";

  // Pre-fill bank from community config when state hasn't been set yet.
  useEffect(() => {
    if (state.rmBankId == null) {
      const community = getCommunityByLabel(invoice.community);
      if (community) {
        onStateChange((prev) =>
          prev.rmBankId == null
            ? { ...prev, rmBankId: community.rmBankId }
            : prev,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.rowNumber]);

  // Ensure at least one bill detail line exists, prefilled with the invoice amount.
  useEffect(() => {
    if (state.billDetails.length === 0) {
      onStateChange((prev) =>
        prev.billDetails.length === 0
          ? {
              ...prev,
              billDetails: [
                {
                  id: crypto.randomUUID(),
                  glAccountId: null,
                  glAccountName: "",
                  amount: invoice.amount ? invoice.amount.toFixed(2) : "",
                  unitId: null,
                  unitName: "",
                  comment: "",
                },
              ],
            }
          : prev,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.rowNumber]);

  const vendorOptions: ComboOption[] = useMemo(
    () =>
      RM_VENDORS.map((v) => ({
        value: String(v.vendorId),
        label: v.name,
        sublabel: `#${v.vendorId}`,
        search: `${v.name} ${v.vendorId}`,
      })),
    [],
  );

  const bankOptions: ComboOption[] = useMemo(
    () =>
      RM_BANKS.map((b) => ({
        value: String(b.bankId),
        label: b.name,
        sublabel: `#${b.bankId}`,
        search: `${b.name} ${b.bankId}`,
      })),
    [],
  );

  const glOptions: ComboOption[] = useMemo(
    () =>
      GL_ACCOUNTS.map((g) => ({
        value: String(g.glAccountId),
        label: `${g.name} (${g.reference})`,
        search: `${g.name} ${g.reference}`,
      })),
    [],
  );

  const communityConfig = useMemo(
    () => getCommunityByLabel(isManual ? (state.manualCommunity || invoice.community) : invoice.community),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoice.community, isManual, state.manualCommunity],
  );

  const unitOptions: ComboOption[] = useMemo(() => {
    if (!communityConfig?.rmPropertyId) return [];
    return getUnitsForProperty(communityConfig.rmPropertyId).map((u) => ({
      value: String(u.UnitID),
      label: u.Name,
      sublabel: u.Comment ? u.Comment.trim().split("\n")[0] : undefined,
      search: `${u.Name} ${u.UnitID}`,
    }));
  }, [communityConfig?.rmPropertyId]);

  // ------- Total / mismatch -------
  const billTotal = state.billDetails.reduce(
    (sum, l) => sum + (Number(l.amount) || 0),
    0,
  );
  const effectiveAmount = isManual && state.manualAmount
    ? Number(state.manualAmount) || 0
    : invoice.amount;
  const mismatch = Math.abs(billTotal - effectiveAmount) > 0.005;

  // ------- Derived values -------
  const effectiveCommunity = isManual ? (state.manualCommunity || invoice.community) : invoice.community;
  const effectiveVendor = isManual ? (state.manualVendor || invoice.vendor) : invoice.vendor;
  const effectiveInvoiceNumber = isManual ? (state.manualInvoiceNumber || invoice.invoiceNumber) : invoice.invoiceNumber;

  const computedFilename = useMemo(
    () =>
      computeFilename(
        effectiveCommunity,
        effectiveVendor,
        state.jobDescription,
        effectiveInvoiceNumber,
        effectiveAmount,
      ),
    [effectiveCommunity, effectiveVendor, state.jobDescription, effectiveInvoiceNumber, effectiveAmount],
  );

  // ------- Handlers -------
  const updateLine = (id: string, patch: Partial<BillDetailLine>) => {
    onStateChange((prev) => ({
      ...prev,
      billDetails: prev.billDetails.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
  };

  const addLine = () =>
    onStateChange((prev) => ({
      ...prev,
      billDetails: [...prev.billDetails, newLine()],
    }));

  const removeLine = (id: string) =>
    onStateChange((prev) => ({
      ...prev,
      billDetails: prev.billDetails.filter((l) => l.id !== id),
    }));

  const finalStatusDone = invoice.finalStatus === "Done";
  const isDone = finalStatusDone || state.doneSubmitted;

  const submitDrive = async () => {
    if (!state.driveFolderId) {
      toast.error("Select a Drive folder first.");
      return;
    }
    if (!invoice.driveFileId) {
      toast.error("No source Drive file found on this invoice.");
      return;
    }
    onStateChange((prev) => ({ ...prev, driveLoading: true, driveError: null }));
    try {
      const data = await copyDriveFile({
        sourceFileId: invoice.driveFileId,
        targetFolderId: state.driveFolderId,
        name: computedFilename,
        rowNumber: invoice.rowNumber,
        existingRow: invoiceRowToArray(invoice),
      });
      onStateChange((prev) => ({
        ...prev,
        driveLoading: false,
        driveSubmitted: true,
        driveError: null,
        driveVendorFileId: data.fileId,
        driveVendorFileLink: data.webViewLink,
      }));
      toast.success("Copied to Drive");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onStateChange((prev) => ({ ...prev, driveLoading: false, driveError: msg }));
      toast.error(`Drive copy failed: ${msg}`);
    }
  };

  const submitRM = async () => {
    if (!state.rmVendorId) { toast.error("Select a Rent Manager vendor."); return; }
    if (!state.rmBankId) { toast.error("Select a bank."); return; }
    if (!state.rmDueDate) { toast.error("Pick a due date."); return; }
    if (state.billDetails.some((l) => !l.glAccountId || !l.amount)) {
      toast.error("Complete all expense lines."); return;
    }
    if (!communityConfig) {
      toast.error(`Community "${effectiveCommunity}" not found in config.`); return;
    }
    onStateChange((prev) => ({ ...prev, rmLoading: true, rmError: null, rmBusinessRuleError: null }));
    try {
      const billDetails = state.billDetails.map((l) => ({
        glAccountId: l.glAccountId,
        glAccountName: l.glAccountName,
        amount: Number(l.amount) || 0,
        comment: l.comment || l.glAccountName,
        unitId: l.unitId ?? null,
      }));
      const summedAmount = billDetails.reduce((s, l) => s + l.amount, 0);
      const res = await fetch("/api/rm-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_rm_bill",
          rowNumber: invoice.rowNumber,
          community: effectiveCommunity,
          rmPropertyId: communityConfig.rmPropertyId,
          rmBankId: state.rmBankId,
          rmVendorId: state.rmVendorId,
          rmVendorName: state.rmVendorName,
          payMethod: state.rmPayMethod,
          memo: state.rmMemo,
          invoiceNumber: effectiveInvoiceNumber,
          amount: Number(summedAmount.toFixed(2)),
          dueDate: state.rmDueDate,
          driveFileId: invoice.driveFileId,
          billDetails,
          timestamp: toChicagoIso(new Date()),
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        const isBR = body.includes("BusinessRuleException");
        onStateChange((prev) => ({
          ...prev,
          rmLoading: false,
          rmError: body || `HTTP ${res.status}`,
          rmBusinessRuleError: isBR ? body : null,
        }));
        toast.error("RM bill creation failed");
        return;
      }
      onStateChange((prev) => ({
        ...prev,
        rmLoading: false,
        rmSubmitted: true,
        rmError: null,
        rmBusinessRuleError: null,
      }));
      toast.success("RM Bill created");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onStateChange((prev) => ({ ...prev, rmLoading: false, rmError: msg }));
      toast.error("RM bill creation failed");
    }
  };

  const submitDone = async () => {
    onStateChange((prev) => ({ ...prev, doneLoading: true, doneError: null }));
    try {
      const billDetails = state.billDetails.map((l) => ({
        glAccountId: l.glAccountId,
        glAccountName: l.glAccountName,
        amount: Number(l.amount) || 0,
        comment: l.comment || l.glAccountName,
      }));

      let payload: Record<string, unknown>;
      if (isManual) {
        payload = {
          source: "manual",
          rowNumber: invoice.rowNumber,
          sheetRow: buildManualRow(invoice, state, communityConfig),
        };
      } else {
        payload = {
          action: "mark_done",
          rowNumber: invoice.rowNumber,
          community: invoice.community,
          invoiceNumber: invoice.invoiceNumber,
          vendor: invoice.vendor,
          amount: invoice.amount,
          rmBillId: invoice.rmBillId,
          driveVendorFolderId: invoice.driveVendorFolderId,
          driveVendorFileId: invoice.driveVendorFileId,
          rmVendorId: state.rmVendorId,
          rmVendorName: state.rmVendorName,
          rmBankId: state.rmBankId,
          billDetails,
          payMethod: state.rmPayMethod,
          confirmedFolderId: state.driveFolderId,
          confirmedFolderName: state.driveFolderName,
          timestamp: toChicagoIso(new Date()),
        };
      }

      const res = await fetch("/api/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      if (!res.ok) {
        onStateChange((prev) => ({ ...prev, doneLoading: false, doneError: body || `HTTP ${res.status}` }));
        toast.error("Mark as done failed");
        return;
      }
      onStateChange((prev) => ({ ...prev, doneLoading: false, doneSubmitted: true, doneError: null }));
      toast.success("Invoice processing complete ✓");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onStateChange((prev) => ({ ...prev, doneLoading: false, doneError: msg }));
      toast.error("Mark as done failed");
    }
  };

  const receivedDate = invoice.timestamp ? new Date(invoice.timestamp) : null;
  const dueDateValue = state.rmDueDate ? new Date(state.rmDueDate + "T12:00:00") : undefined;

  return (
    <div className="space-y-4 p-4">
      {/* Section 1: Extracted data */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {isManual ? "Invoice Details" : "Extracted Data"}
          </h3>
          <StatusBadge status={isDone ? "Done" : invoice.status} />
        </div>

        {isManual ? (
          /* Editable form for manual invoices */
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
            <label className="self-center text-muted-foreground">Community</label>
            <Select
              value={state.manualCommunity || invoice.community}
              onValueChange={(v) => onStateChange((prev) => ({ ...prev, manualCommunity: v }))}
              disabled={isDone}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select community…" />
              </SelectTrigger>
              <SelectContent>
                {COMMUNITIES.map((c) => (
                  <SelectItem key={c.label} value={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="self-center text-muted-foreground">Vendor</label>
            <Input
              className="h-7 text-xs"
              value={state.manualVendor || invoice.vendor}
              onChange={(e) => onStateChange((prev) => ({ ...prev, manualVendor: e.target.value }))}
              disabled={isDone}
              placeholder="Vendor name…"
            />

            <label className="self-center text-muted-foreground">Invoice #</label>
            <Input
              className="h-7 font-mono text-xs"
              value={state.manualInvoiceNumber || invoice.invoiceNumber}
              onChange={(e) => onStateChange((prev) => ({ ...prev, manualInvoiceNumber: e.target.value }))}
              disabled={isDone}
              placeholder="Invoice number…"
            />

            <label className="self-center text-muted-foreground">Amount</label>
            <Input
              className="h-7 font-mono text-xs font-semibold"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={state.manualAmount || (invoice.amount ? invoice.amount.toFixed(2) : "")}
              onChange={(e) => onStateChange((prev) => ({ ...prev, manualAmount: e.target.value }))}
              disabled={isDone}
              placeholder="0.00"
            />

            <label className="self-center text-muted-foreground">Payment</label>
            <Input
              className="h-7 text-xs"
              value={state.manualPaymentMethod || invoice.paymentMethod}
              onChange={(e) => onStateChange((prev) => ({ ...prev, manualPaymentMethod: e.target.value }))}
              disabled={isDone}
              placeholder="ACH, Check…"
            />

            <label className="self-center text-muted-foreground">Received</label>
            <span className="self-center text-muted-foreground">
              {receivedDate ? formatChicagoFull(receivedDate) : "—"}
            </span>
          </div>
        ) : (
          /* Read-only for normal sheet invoices */
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
            <Field label="Community" value={invoice.community} />
            <Field label="Invoice #" value={invoice.invoiceNumber} mono />
            <Field label="Amount" value={formatUSD(invoice.amount)} mono strong />
            <Field label="Vendor" value={invoice.vendor} />
            <Field label="Payment Method" value={invoice.paymentMethod || "—"} />
            <Field label="Task" value={invoice.taskName} />
            <Field
              label="Received"
              value={receivedDate ? formatChicagoFull(receivedDate) : "—"}
            />
          </dl>
        )}
      </Card>

      {/* Section 2: Drive */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold">Copy to Google Drive</h3>
        </div>

        <div className="space-y-3">
          <DriveFolderPicker
            community={effectiveCommunity}
            vendor={effectiveVendor}
            breadcrumb={state.driveBreadcrumb}
            onBreadcrumbChange={(crumbs) =>
              onStateChange((prev) => ({ ...prev, driveBreadcrumb: crumbs }))
            }
            selectedFolderId={state.driveFolderId}
            onSelect={(folderId, folderName) =>
              onStateChange((prev) => ({ ...prev, driveFolderId: folderId, driveFolderName: folderName }))
            }
            disabled={state.driveSubmitted || isDone}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Job Description</label>
            <Input
              value={state.jobDescription}
              onChange={(e) =>
                onStateChange((prev) => ({ ...prev, jobDescription: e.target.value }))
              }
              placeholder="e.g. Pool Repairs, HVAC Service…"
              className="h-8 text-xs"
              disabled={state.driveSubmitted || isDone}
            />
          </div>

          {(state.driveFolderId || state.jobDescription) && (
            <div className="rounded-md bg-muted px-2 py-1.5">
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Filename preview</p>
              <p className="break-all font-mono text-[10px] text-foreground">{computedFilename}</p>
            </div>
          )}
        </div>

        {state.driveError && !state.driveSubmitted && <ErrorBox text={state.driveError} />}
        {state.driveSubmitted && <SuccessBox text="Copied to Drive" />}

        <Button
          type="button"
          onClick={submitDrive}
          aria-label="Copy to Google Drive"
          disabled={state.driveSubmitted || state.driveLoading || !state.driveFolderId || isDone}
          className={cn(
            "mt-3 w-full",
            state.driveSubmitted || isDone
              ? "bg-muted text-muted-foreground hover:bg-muted"
              : "bg-blue-600 text-white hover:bg-blue-700",
          )}
        >
          {state.driveLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Copying…</>
          ) : state.driveSubmitted ? (
            <><CheckCircle2 className="h-4 w-4" /> Copied</>
          ) : (
            <>Copy to Drive ↑</>
          )}
        </Button>
      </Card>

      {/* Section 3: RM */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-purple-600" />
          <h3 className="text-sm font-semibold">Create Bill in Rent Manager</h3>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">RM Vendor</label>
            <SearchCombobox
              options={vendorOptions}
              value={state.rmVendorId != null ? String(state.rmVendorId) : null}
              onChange={(v, opt) =>
                onStateChange((prev) => ({
                  ...prev,
                  rmVendorId: v ? Number(v) : null,
                  rmVendorName: opt?.label ?? "",
                }))
              }
              placeholder="Select a vendor…"
              searchPlaceholder="Search vendors…"
              disabled={state.rmSubmitted || isDone}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Expense Lines</label>
            {state.billDetails.map((line) => (
              <div key={line.id} className="space-y-1.5 rounded-md border border-dashed border-muted-foreground/20 p-2">
                <SearchCombobox
                  options={glOptions}
                  value={line.glAccountId != null ? String(line.glAccountId) : null}
                  onChange={(v, opt) =>
                    updateLine(line.id, {
                      glAccountId: v ? Number(v) : null,
                      glAccountName: opt ? opt.label.replace(/\s*\([^)]+\)\s*$/, "") : "",
                    })
                  }
                  placeholder="Select GL account…"
                  searchPlaceholder="Search accounts…"
                  disabled={state.rmSubmitted || isDone}
                />
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchCombobox
                      options={unitOptions}
                      value={line.unitId != null ? String(line.unitId) : null}
                      onChange={(v, opt) =>
                        updateLine(line.id, {
                          unitId: v ? Number(v) : null,
                          unitName: opt?.label ?? "",
                        })
                      }
                      placeholder="Unit (optional)…"
                      searchPlaceholder="Search units…"
                      disabled={state.rmSubmitted || isDone}
                    />
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-28"
                    value={line.amount}
                    onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                    disabled={state.rmSubmitted || isDone}
                    aria-label="Line amount"
                  />
                  {state.billDetails.length > 1 && !state.rmSubmitted && !isDone && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removeLine(line.id)}
                      aria-label="Remove line"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Input
                  type="text"
                  placeholder="Comment (optional)…"
                  maxLength={200}
                  value={line.comment}
                  onChange={(e) => updateLine(line.id, { comment: e.target.value })}
                  disabled={state.rmSubmitted || isDone}
                  aria-label="Line comment"
                />
              </div>
            ))}
            {!state.rmSubmitted && !isDone && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addLine}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3" /> Add expense line
              </Button>
            )}
            <div
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-xs",
                mismatch
                  ? "bg-orange-50 text-orange-800 border border-orange-200"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span>
                Lines total:{" "}
                <span className="font-mono font-medium">{formatUSD(billTotal)}</span>
              </span>
              <span>
                Invoice:{" "}
                <span className="font-mono font-medium">{formatUSD(effectiveAmount)}</span>
              </span>
            </div>
            {mismatch && (
              <p className="text-[11px] text-orange-700">
                Totals don't match the invoice amount. You can still submit.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Default Bank</label>
            <SearchCombobox
              options={bankOptions}
              value={state.rmBankId != null ? String(state.rmBankId) : null}
              onChange={(v) =>
                onStateChange((prev) => ({ ...prev, rmBankId: v ? Number(v) : null }))
              }
              placeholder="Select a bank…"
              searchPlaceholder="Search banks…"
              disabled={state.rmSubmitted || isDone}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Payment Method</label>
              <Select
                value={state.rmPayMethod}
                onValueChange={(v) =>
                  onStateChange((prev) => ({ ...prev, rmPayMethod: v as PayMethod }))
                }
                disabled={state.rmSubmitted || isDone}
              >
                <SelectTrigger className="h-9" aria-label="Payment method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACH">ACH</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                  <SelectItem value="CreditCard">CreditCard</SelectItem>
                  <SelectItem value="Petty Cash">Petty Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Due Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Pick due date"
                    disabled={state.rmSubmitted || isDone}
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !state.rmDueDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dueDateValue ? format(dueDateValue, "PP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDateValue}
                    onSelect={(d) =>
                      onStateChange((prev) => ({
                        ...prev,
                        rmDueDate: d ? format(d, "yyyy-MM-dd") : "",
                      }))
                    }
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">RM Memo (optional)</label>
              <span className="text-[10px] text-muted-foreground">{state.rmMemo.length}/200</span>
            </div>
            <Textarea
              maxLength={200}
              rows={2}
              value={state.rmMemo}
              onChange={(e) =>
                onStateChange((prev) => ({ ...prev, rmMemo: e.target.value }))
              }
              disabled={state.rmSubmitted || isDone}
              placeholder="Notes for this bill…"
              aria-label="RM memo"
            />
          </div>
        </div>

        {state.rmBusinessRuleError && (
          <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-xs text-orange-900">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-3.5 w-3.5" /> BusinessRuleException
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
              {state.rmBusinessRuleError}
            </pre>
          </div>
        )}
        {state.rmError && !state.rmBusinessRuleError && !state.rmSubmitted && (
          <ErrorBox text={state.rmError} />
        )}
        {state.rmSubmitted && <SuccessBox text="RM Bill Created" />}

        <Button
          type="button"
          onClick={submitRM}
          aria-label="Create Rent Manager bill"
          disabled={state.rmSubmitted || state.rmLoading || isDone}
          className={cn(
            "mt-3 w-full",
            state.rmSubmitted || isDone
              ? "bg-muted text-muted-foreground hover:bg-muted"
              : "bg-purple-600 text-white hover:bg-purple-700",
          )}
        >
          {state.rmLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
          ) : state.rmSubmitted ? (
            <><CheckCircle2 className="h-4 w-4" /> Created</>
          ) : (
            <>Create RM Bill ↑</>
          )}
        </Button>
      </Card>

      {/* Section 4: Mark as done */}
      {(state.driveSubmitted && state.rmSubmitted) || isDone ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCheck className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">Finalize</h3>
          </div>
          {state.doneError && !state.doneSubmitted && <ErrorBox text={state.doneError} />}
          {(state.doneSubmitted || finalStatusDone) && (
            <SuccessBox text="Invoice processing complete" />
          )}
          <Button
            type="button"
            onClick={submitDone}
            aria-label="Mark invoice as done"
            disabled={state.doneSubmitted || state.doneLoading || finalStatusDone}
            className={cn(
              "mt-1 w-full",
              state.doneSubmitted || finalStatusDone
                ? "bg-muted text-muted-foreground hover:bg-muted"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {state.doneLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Finishing…</>
            ) : state.doneSubmitted || finalStatusDone ? (
              <><CheckCircle2 className="h-4 w-4" /> Done</>
            ) : (
              <>✓ Mark as Done</>
            )}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono", strong && "font-semibold")}>
        {value || "—"}
      </dd>
    </>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertCircle className="h-3.5 w-3.5" /> Error
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
        {text}
      </pre>
    </div>
  );
}

function SuccessBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}

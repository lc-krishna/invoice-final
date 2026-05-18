import { ExternalLink } from "lucide-react";
import type { InvoiceRow } from "@/lib/types";
import { invoiceKey } from "@/lib/sheets";

interface PdfPreviewProps {
  invoice: InvoiceRow | null;
}

/**
 * Convert a Drive webview URL like
 *   https://drive.google.com/file/d/<id>/view?usp=...
 * into the embeddable
 *   https://drive.google.com/file/d/<id>/preview
 */
function toPreviewUrl(link: string): string {
  if (!link) return link;
  return link.replace(/\/view(\?[^/]*)?$/, "/preview");
}

export function PdfPreview({ invoice }: PdfPreviewProps) {
  // Per v2 spec, col M ("Drive File ID (webview link)") holds the webview URL.
  const link = invoice?.driveFileId ?? "";
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-muted/30">
      <div className="flex items-center justify-between border-b bg-background px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Invoice Preview
          </div>
          {invoice && (
            <div className="truncate text-sm font-medium">
              {invoice.vendor || "—"} #{invoice.invoiceNumber || "—"}
            </div>
          )}
        </div>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open in Drive <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="flex-1">
        {link ? (
          <iframe
            key={invoice ? invoiceKey(invoice) : "empty"}
            src={toPreviewUrl(link)}
            title="Invoice PDF"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            PDF will appear here once uploaded to Drive.
          </div>
        )}
      </div>
    </section>
  );
}

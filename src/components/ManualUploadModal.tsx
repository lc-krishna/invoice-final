import { useRef, useState } from "react";
import { Loader2, Upload, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { InvoiceRow } from "@/lib/types";
import {
  completeManual,
  createUploadSession,
  verifyUpload,
} from "@/lib/drive";

interface ManualUploadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: InvoiceRow) => void;
}

export function ManualUploadModal({ open, onClose, onCreated }: ManualUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setError(null);
    setUploading(false);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      // Step 1: server creates a resumable upload session pointing at the
      // RAW_INVOICES folder (manualUploadFolderId on the server side).
      const { uploadUrl } = await createUploadSession({
        name: file.name,
        mimeType: file.type || "application/pdf",
        size: file.size,
      });

      // Step 2: PUT bytes directly to Google's resumable URL. Don't set
      // Content-Type — Google already has it via X-Upload-Content-Type from
      // step 1. Content-Range tells Google this is the entire object.
      let uploadedId: string | null = null;
      let uploadedWebViewLink: string | null = null;
      try {
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
          },
          body: file,
        });
        if (uploadRes.status === 200 || uploadRes.status === 201) {
          try {
            const meta = (await uploadRes.json()) as {
              id?: string;
              webViewLink?: string;
            };
            uploadedId = meta.id ?? null;
            uploadedWebViewLink = meta.webViewLink ?? null;
          } catch {
            // Response body unreadable — fall through to server-side verify
          }
        } else if (!uploadRes.ok) {
          const msg = await uploadRes.text().catch(() => `HTTP ${uploadRes.status}`);
          throw new Error(`Drive upload failed: ${msg}`);
        }
      } catch (e) {
        // Network/CORS error on reading the response. The PUT itself may have
        // succeeded — let the verify step below decide.
        // (Re-throw only if it's clearly not a "response unreadable" case.)
        if (
          e instanceof TypeError &&
          /failed to fetch|networkerror/i.test(e.message)
        ) {
          // swallow — verify will confirm
        } else {
          throw e;
        }
      }

      // Step 2b: if we couldn't read the PUT response, ask the server to find
      // the just-uploaded file by name in RAW_INVOICES.
      if (!uploadedId) {
        const verified = await verifyUpload({ filename: file.name });
        uploadedId = verified.fileId;
        uploadedWebViewLink = verified.webViewLink;
      }

      // Step 3: append the stub row to the Invoice Log sheet.
      const { invoice } = await completeManual({
        fileId: uploadedId,
        webViewLink: uploadedWebViewLink ?? undefined,
        fileName: file.name,
      });
      if (!invoice) throw new Error("No invoice returned from server");

      onCreated(invoice as InvoiceRow);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Manual Invoice</DialogTitle>
          <DialogDescription>
            Select a PDF to upload directly to Google Drive. A new row will be added
            to the Invoice Log for you to fill in details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* File picker */}
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-8 text-center transition-colors hover:border-muted-foreground/50 hover:bg-muted/40"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-blue-500" />
                <p className="max-w-[280px] break-all text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {!uploading && (
                  <span className="text-xs text-muted-foreground underline">Click to change</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <p className="text-sm">Click to select a PDF</p>
                <p className="text-xs">or drag and drop</p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {uploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Upload to Drive</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

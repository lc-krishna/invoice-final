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
import { completeManual, createUploadSession } from "@/lib/drive";

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
      // Step 1: get a resumable upload URL from the server
      const { uploadUrl } = await createUploadSession({
        name: file.name,
        mimeType: file.type || "application/pdf",
        size: file.size,
      });

      // Step 2: PUT file bytes directly to Google (bypasses Vercel 4.5MB limit)
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!uploadRes.ok && uploadRes.status !== 200) {
        const msg = await uploadRes.text().catch(() => `HTTP ${uploadRes.status}`);
        throw new Error(`Drive upload failed: ${msg}`);
      }
      const uploadedFile = (await uploadRes.json()) as { id?: string; webViewLink?: string };
      if (!uploadedFile.id) throw new Error("Google did not return a file ID");

      // Step 3: append a row to the Invoice Log sheet and return the new InvoiceRow
      const { invoice } = await completeManual({
        fileId: uploadedFile.id,
        webViewLink: uploadedFile.webViewLink,
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

export interface Community {
  label: string;
  rmPropertyId: number | null;
  rmBankId: number | null;
  melioEmail: string | null;
  folderId: string | null;
}

export interface DriveFolder {
  folderName: string;
  folderId: string;
  fullPath: string;
  community: string;
}

export interface RMVendor {
  vendorId: number;
  name: string;
}

export interface RMBank {
  bankId: number;
  name: string;
}

export interface GLAccount {
  glAccountId: number;
  name: string;
  reference: string;
}

/**
 * Invoice row mapped from the "Invoice Log" sheet (cols A:Y).
 * `rowNumber` is the actual sheet row (serialNo + 1 typically) used as the
 * stable primary key by all webhooks.
 */
export interface InvoiceRow {
  source: "sheet" | "manual";
  rowNumber: number; // actual sheet row index (1-based)
  serialNo: string; // col A
  timestamp: string; // col B (ISO)
  community: string; // col C
  communityAsanaGid: string; // col D
  taskName: string; // col E
  vendor: string; // col F
  invoiceNumber: string; // col G
  amount: number; // col H
  paymentMethod: string; // col I
  status: string; // col J
  melioEmail: string; // col K
  communityFolderId: string; // col L
  driveFileId: string; // col M (webview link)
  rmBillId: string; // col N
  rmBillUploadStatus: string; // col O
  rmBillUploadError: string; // col P
  rmAttachmentStatus: string; // col Q
  rmAttachmentError: string; // col R
  driveVendorFolderId: string; // col S
  driveVendorFileId: string; // col T
  driveUploadStatus: string; // col U
  driveUploadError: string; // col V
  asanaTaskGid: string; // col W
  asanaTaskUrl: string; // col X
  finalStatus: string; // col Y ("Done" when complete)
}

export interface RMUnit {
  UnitID: number;
  PropertyID: number;
  Name: string;
  Comment: string;
  UnitTypeID: number;
}

export interface BillDetailLine {
  id: string; // local row id
  glAccountId: number | null;
  glAccountName: string;
  amount: string; // keep as string for input handling
  unitId: number | null;
  unitName: string;
  comment: string;
}

export interface InvoiceState {
  // Drive
  driveFolderId: string | null;
  driveFolderName: string;
  driveBreadcrumb: { id: string; name: string }[];
  driveVendorFileId: string;
  driveVendorFileLink: string;
  jobDescription: string;
  driveSubmitted: boolean;
  driveLoading: boolean;
  driveError: string | null;
  // Manual editable invoice fields
  manualCommunity: string;
  manualVendor: string;
  manualInvoiceNumber: string;
  manualAmount: string;
  manualPaymentMethod: string;
  // RM
  rmVendorId: number | null;
  rmVendorName: string;
  rmBankId: number | null;
  rmPayMethod: "ACH" | "Check" | "CreditCard" | "Petty Cash";
  rmMemo: string;
  rmDueDate: string; // YYYY-MM-DD
  billDetails: BillDetailLine[];
  rmSubmitted: boolean;
  rmLoading: boolean;
  rmError: string | null;
  rmBusinessRuleError: string | null;
  rmBillId: string;
  // Done
  doneSubmitted: boolean;
  doneLoading: boolean;
  doneError: string | null;
}

export type PayMethod = InvoiceState["rmPayMethod"];

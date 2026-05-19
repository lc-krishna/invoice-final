import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, FolderOpen, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCommunityByLabel } from "@/lib/configs";

type Crumb = { id: string; name: string };

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveFolderPickerProps {
  community: string;
  vendor: string;
  breadcrumb: Crumb[];
  onBreadcrumbChange: (crumbs: Crumb[]) => void;
  selectedFolderId: string | null;
  onSelect: (folderId: string, folderName: string) => void;
  disabled?: boolean;
}

// Flexible matcher for the parent "Vendors" folder under a community root.
// Matches "Vendors", "Vendor", "10 | Vendors", "Vendor Folder", etc.
const VENDORS_PATTERN = /vendors?/i;

async function fetchFolders(parentId: string): Promise<DriveFolder[]> {
  const res = await fetch(`/api/drive/folders?parentId=${encodeURIComponent(parentId)}`);
  if (!res.ok) throw new Error(`Drive folders ${res.status}`);
  const body = (await res.json()) as { folders?: DriveFolder[] };
  return body.folders ?? [];
}

async function createFolder(parentId: string, name: string): Promise<DriveFolder> {
  const res = await fetch("/api/drive/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId, name }),
  });
  if (!res.ok) throw new Error(`Create folder ${res.status}`);
  const body = (await res.json()) as { folder?: DriveFolder };
  if (!body.folder) throw new Error("No folder returned");
  return body.folder;
}

export function DriveFolderPicker({
  community,
  vendor,
  breadcrumb,
  onBreadcrumbChange,
  selectedFolderId,
  onSelect,
  disabled = false,
}: DriveFolderPickerProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const autoRan = useRef<string>("");

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;

  const loadFolders = useCallback(async (parentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchFolders(parentId);
      setFolders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-navigate: community root → Vendors folder → show its subfolders.
  // From there the user clicks iteratively to go deeper; the last breadcrumb
  // is always the upload destination.
  useEffect(() => {
    if (disabled) return;
    const communityConfig = getCommunityByLabel(community);
    const rootId = communityConfig?.folderId;
    if (!rootId) return;

    if (autoRan.current === community) return;
    if (breadcrumb.length > 0) return;

    autoRan.current = community;
    const rootCrumb: Crumb = { id: rootId, name: community };

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rootChildren = await fetchFolders(rootId);
        const vendorsFolder = rootChildren.find((f) => VENDORS_PATTERN.test(f.name));

        if (vendorsFolder) {
          // Found Vendors — go inside, surface its subfolders (individual vendor folders)
          const vendorsCrumb: Crumb = { id: vendorsFolder.id, name: vendorsFolder.name };
          const vendorsChildren = await fetchFolders(vendorsFolder.id);
          onBreadcrumbChange([rootCrumb, vendorsCrumb]);
          onSelect(vendorsFolder.id, vendorsFolder.name);
          setFolders(vendorsChildren);
        } else {
          // No Vendors folder under this community — stay at root, let user pick or create
          onBreadcrumbChange([rootCrumb]);
          onSelect(rootId, community);
          setFolders(rootChildren);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community, disabled]);

  // Load folders whenever the deepest breadcrumb crumb changes (manual navigation)
  useEffect(() => {
    if (!currentParentId) return;
    // Skip if already loading from auto-navigation
    if (loading) return;
    loadFolders(currentParentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParentId]);

  const enterFolder = useCallback(
    async (folder: DriveFolder) => {
      if (disabled) return;
      const newCrumbs = [...breadcrumb, { id: folder.id, name: folder.name }];
      onSelect(folder.id, folder.name);
      onBreadcrumbChange(newCrumbs);
      setLoading(true);
      setError(null);
      try {
        setFolders(await fetchFolders(folder.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [breadcrumb, disabled, onBreadcrumbChange, onSelect],
  );

  const navigateToCrumb = useCallback(
    async (idx: number) => {
      if (disabled) return;
      const crumb = breadcrumb[idx];
      if (!crumb) return;
      const newCrumbs = breadcrumb.slice(0, idx + 1);
      onSelect(crumb.id, crumb.name);
      onBreadcrumbChange(newCrumbs);
      setLoading(true);
      setError(null);
      try {
        setFolders(await fetchFolders(crumb.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [breadcrumb, disabled, onBreadcrumbChange, onSelect],
  );

  const handleCreate = async () => {
    const name = newFolderName.trim();
    if (!name || !currentParentId) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createFolder(currentParentId, name);
      setNewFolderName("");
      await enterFolder(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const communityConfig = getCommunityByLabel(community);
  const noRoot = !communityConfig?.folderId;

  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5 rounded-md bg-muted px-2 py-1.5 text-[11px]">
          {breadcrumb.map((crumb, idx) => (
            <span key={crumb.id} className="flex items-center gap-0.5">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
              <button
                type="button"
                onClick={() => navigateToCrumb(idx)}
                disabled={disabled || idx === breadcrumb.length - 1}
                className={cn(
                  "max-w-[120px] truncate rounded px-1 py-0.5 transition-colors",
                  idx === breadcrumb.length - 1
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer",
                  disabled && "cursor-default",
                )}
                title={crumb.name}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Selected folder indicator */}
      {selectedFolderId && (
        <div className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">
            {breadcrumb[breadcrumb.length - 1]?.name ?? "Selected"}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-md bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {/* No root configured */}
      {noRoot && (
        <p className="text-[11px] text-muted-foreground">
          No Drive root configured for "{community}".
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…
        </div>
      )}

      {/* Folder list */}
      {!loading && !noRoot && folders.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => enterFolder(f)}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors",
                "hover:bg-muted border-b border-muted last:border-b-0",
                disabled && "cursor-default opacity-60",
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && !noRoot && folders.length === 0 && breadcrumb.length > 0 && (
        <p className="text-[11px] text-muted-foreground">No subfolders here.</p>
      )}

      {/* Create folder */}
      {!disabled && !noRoot && currentParentId && (
        <div className="flex gap-1.5">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name…"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2"
            onClick={handleCreate}
            disabled={!newFolderName.trim() || creating}
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

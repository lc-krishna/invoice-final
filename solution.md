# Folder Mapping Approach

This app maps Google Drive folders from a small static park list into a browsable upload destination tree.

## 1. Static Root Mapping

Each park is stored in `src/config/parks.json` with:

```json
{
  "id": 1,
  "park": "Example Community",
  "folderId": "GOOGLE_DRIVE_FOLDER_ID"
}
```

That `folderId` is the park's root folder in Google Drive. The UI does not search all Drive folders globally. It starts from a known root, which makes folder lookup faster and safer.

## 2. Photos & Videos Detection

When a user selects a park, the app lists direct child folders under the park root and searches for the Photos & Videos folder.

The matcher is intentionally flexible:

```ts
const PV_PATTERN = /photos.{0,20}videos/i;
```

So these can all match:

- `Photos & Videos`
- `10 | Photos & Videos`
- `Photos and Videos`
- `Photos - Videos`

This matters because Drive folder naming is not always perfectly consistent.

## 3. Breadcrumb Folder Tree

The selected destination path is stored as breadcrumbs:

```ts
type Crumb = { id: string; name: string };
```

Example:

```ts
[
  { id: "parkRootId", name: "Messer Community" },
  { id: "photosVideosId", name: "10 | Photos & videos" },
  { id: "subfolderId", name: "360 Degree Photos and videos" }
]
```

The last breadcrumb is always the current destination folder.

## 4. Folder Traversal

Whenever the user clicks into a folder, the app:

1. Appends that folder to `crumbs`.
2. Calls Google Drive `files.list` for folders whose parent is the current folder ID.
3. Shows those children as selectable folder buttons.

The Drive query shape is:

```text
'PARENT_FOLDER_ID' in parents
and mimeType='application/vnd.google-apps.folder'
and trashed=false
```

This lets the UI walk the Drive tree without needing a database copy of the whole tree.

## 5. Missing Folder Handling

If a park does not have a matching Photos & Videos folder, the app shows a prompt to create one. That creates:

```text
Photos & Videos
```

under the selected park root, then uses that new folder as the starting point.

## 6. Upload Destination

Uploads go to:

```ts
const targetFolder = crumbs[crumbs.length - 1];
```

So the destination is whatever folder the user has navigated to most recently.

## Adapting This To Invoices

For an invoice project, use the same structure:

1. Maintain a static root list, such as clients, properties, vendors, or companies.
2. Start from the selected root folder ID.
3. Search for a flexible invoice folder pattern, for example:

```ts
const INVOICE_PATTERN = /invoice|invoices|billing|accounts payable/i;
```

4. Store navigation as breadcrumbs.
5. Treat the last breadcrumb as the upload destination.
6. Optionally create missing standard folders, such as:

```text
Invoices
Invoices/2026
Invoices/2026/May
```

The important idea is: do not hardcode every nested folder. Hardcode only stable roots, then discover and traverse child folders from Google Drive.

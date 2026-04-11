# Task 6: Admin Edit/Delete/Add Recovery Features

## Work Completed

### A. Edit/Delete Recovery Entries (inside expanded shop details)

1. **Shop-level expandability**: Added `expandedShops` state (`Set<string>`) with `toggleShopExpand()` function. Each shop row now has a chevron toggle button (ChevronRight/ChevronDown) in a new first column to expand/collapse individual recovery entries.

2. **Nested recovery entries table**: When a shop is expanded, a nested table appears below it showing:
   - Time (formatted with 12-hour clock)
   - Amount (green, right-aligned)
   - Description (truncated, hidden on small screens)
   - GPS indicator
   - **Actions column** (hidden on screens below md breakpoint) with:
     - **Edit button**: Pencil icon, ghost variant, h-7 w-7
     - **Delete button**: Trash2 icon, ghost variant, h-7 w-7, text-red-500 hover:text-red-700

3. **Edit Recovery Dialog** (`Dialog` component):
   - Pre-filled with current amount and description
   - Amount (number input) and Description (text input) fields
   - "Save Changes" button opens confirmation AlertDialog
   - On confirm: calls `PATCH /api/transactions` with `{ id, amount, description, updatedBy }`
   - On success: toast notification, closes both dialogs, calls `fetchSummary()` to refresh

4. **Delete Recovery AlertDialog**:
   - Shows: "Delete this recovery entry of Rs. X? This action cannot be undone."
   - Cancel and Delete buttons (Delete styled red)
   - On confirm: calls `DELETE /api/transactions?id=xxx&deletedBy=yyy`
   - On success: toast notification, closes dialog, calls `fetchSummary()` to refresh

### B. Add Recovery Feature

1. **"Add Recovery" Button**: Green button (bg-green-600) with Plus icon, placed in the header area before the date picker.

2. **3-Step Add Recovery Dialog**:
   - **Step indicator**: 3 progress bars at top showing current step
   - **Step 1**: Select orderbooker from dropdown (fetched from `/api/orderbookers`)
   - **Step 2**: Select shop from dropdown (filtered by selected orderbooker, fetched from `/api/shops`)
   - **Step 3**: Enter amount (required) and optional description
   - Navigation: Back/Cancel + Next/Add Recovery buttons
   - On submit: calls `POST /api/transactions` with `{ shopId, type: 'recovery', amount, description, createdBy }`
   - On success: toast notification, closes dialog, calls `fetchSummary()` to refresh
   - Dropdowns fetched on dialog open with loading spinner

### Imports Added
- `Pencil`, `Trash2`, `Plus` from lucide-react
- `ChevronRight` from lucide-react (for shop expand toggle)
- `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle` from shadcn/ui
- `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from shadcn/ui
- `Label` from shadcn/ui
- `user` extracted from `useAppStore()`

### Verification
- ESLint: 0 errors
- Dev server: No compilation errors, all API routes returning 200

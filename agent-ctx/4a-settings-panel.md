---
Task ID: 4a
Agent: Settings Panel Agent
Task: Create Settings/Profile Panel Component for Al-Falah Traders admin panel

Work Log:
- Read worklog.md and understood full project state (16+ components, 7+ API routes, complete system)
- Read all relevant source files: AdminLayout.tsx, ThemeToggle.tsx, store.ts, csv-export.ts, sheet.tsx, switch.tsx, card.tsx, badge.tsx, globals.css, use-hydrated.ts
- Identified existing patterns: toast from use-toast, exportToCSV from csv-export, useHydrated for hydration safety, shadcn/ui components

### Files Created:

1. **`/src/components/alfalah/SettingsPanel.tsx`** — Full settings side panel component
   - Uses shadcn/ui Sheet sliding from the right (side="right", sm:max-w-md)
   - Props: `open: boolean`, `onOpenChange: (open: boolean) => void`

   **Navy Blue Gradient Header:**
   - Settings icon + "Settings" title + description
   - User profile card with: gradient avatar circle (h-14 w-14, initials), name, role badge (Administrator/Orderbooker), phone, @username

   **Appearance Section:**
   - Theme toggle with 3-button segmented control (Sun/Light, Moon/Dark, Monitor/System)
   - Uses next-themes `useTheme()` for state, `useHydrated()` for hydration safety
   - Compact mode toggle using shadcn/ui Switch, persisted to localStorage as `alfalah-compact-mode`
   - Both settings show toast notifications on change

   **Data Management Section:**
   - Export All Data button: fetches shops + orderbookers from API, calls `exportToCSV()` for each
   - Clear Cache button: iterates localStorage and removes all keys with `alfalah-` prefix
   - Both buttons show loading spinners during operation and toast on success/failure
   - Clear Cache button has red styling for destructive action

   **System Info Section:**
   - Version: v1.0
   - Total Shops: fetched from `/api/shops?includeInactive=true` when sheet opens
   - Total Orderbookers: fetched from `/api/orderbookers` when sheet opens
   - Database Status: green "Connected" indicator with animated ping dot

   **About Section:**
   - Al-Falah Traders branded card with Building2 icon in gradient circle
   - "Smart Credit & Route Management v1.0"
   - "Built with Next.js 16, Prisma, and Tailwind CSS"
   - Copyright notice with dynamic year

   **Design Details:**
   - Professional card-based sections with proper spacing (space-y-6)
   - Each section has icon + title header
   - Cards use `py-0 gap-0` to remove default Card padding for tighter rows
   - Sections separated by 8x8 muted background icon containers
   - Custom scrollbar for scrollable content area
   - All icons from lucide-react as specified

### Files Modified:

2. **`/src/components/alfalah/AdminLayout.tsx`** — Settings panel integration
   - Added `Settings` import from lucide-react
   - Added `SettingsPanel` component import
   - Added `settingsOpen` state variable
   - Inserted Settings gear icon button in header bar between user info section and ThemeToggle
   - Button uses: `variant="ghost" size="icon" className="text-blue-100 hover:bg-white/10 hover:text-white"`
   - Wrapped with vertical separators for visual consistency with existing header items
   - Rendered `<SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />` at end of layout

### globals.css:
- No changes needed — all CSS classes used already exist (alfalah-gradient, custom-scrollbar, etc.)

### Verification:
- `bun run lint` passes cleanly with zero errors
- Dev server compiles successfully (no compilation errors in dev.log)
- All existing features preserved — no breaking changes

Stage Summary:
- Professional Settings/Profile side panel created as a Sheet component
- 5 organized sections: User Profile, Appearance, Data Management, System Info, About
- Theme toggle with 3-way segmented control (Light/Dark/System)
- Compact mode toggle persisted to localStorage
- CSV data export for shops and orderbookers
- Cache clearing for all alfalah-prefixed localStorage entries
- Live system stats fetched from API on panel open
- Database connection status indicator with animated ping
- Branded About section with Al-Falah Traders info
- Seamless integration into admin header with gear icon button

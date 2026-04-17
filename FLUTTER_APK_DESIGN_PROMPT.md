# 🏪 Al-Falah Traders — Flutter APK Design & Development Prompt

## 📌 Project Overview

**Al-Falah Traders — Smart Credit & Route Management System**

Yeh ek wholesale/distribution business ka system hai jahan:
- **Admin** (malik/owner) apna saara system manage karta hai — shops, orderbookers, credit posting, recovery tracking, reports etc.
- **Orderbookers** (field workers) mobile app use karke shops par jaate hain, credit deliveries karte hain aur recovery (payment collection) karte hain

Live website: `https://alfalah-traders.vercel.app` (for reference)

---

## 🎯 Target Audience & Users

### 1. Admin (Owner/Manager)
- Full system access
- Credit posting, recovery approval, shop management, reports, analytics
- Works from office on phone/tablet

### 2. Orderbooker (Field Worker/Salesman)
- Assigned specific shops on specific route days
- Collects recovery (cash payments) from shops
- GPS tracking on recovery collection
- Works on mobile in the field (offline support needed!)

---

## 🗄️ Database Schema (Data Model)

Backend PostgreSQL hai. Flutter app ko same API endpoints use karne hain:

### **User** Table
| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| username | String | Unique login username |
| password | String | Hashed password |
| name | String | Display name |
| role | String | "admin" or "orderbooker" |
| phone | String? | Phone number |
| status | String | "active" or "inactive" |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### **Shop** Table
| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| name | String | Shop name |
| ownerName | String? | Owner name |
| area | String? | Area/neighborhood |
| address | String? | Full address |
| phone | String? | Shop phone |
| routeDay | String | "monday", "tuesday"..." (working day) |
| orderbookerId | String | Assigned orderbooker |
| balance | Float | Running balance (outstanding) |
| creditLimit | Float | Credit limit (0 = no limit) |
| status | String | "active" or "inactive" |

### **Transaction** Table
| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| shopId | String | Related shop |
| type | String | "credit" or "recovery" |
| status | String | "pending", "approved", "rejected" |
| amount | Float | Transaction amount |
| previousBalance | Float | Balance before transaction |
| newBalance | Float | Balance after transaction |
| description | String? | Note/description |
| createdBy | String | User who created |
| approvedBy | String? | Admin who approved |
| approvedAt | DateTime? | Approval timestamp |
| rejectReason | String? | Reason for rejection |
| gpsLat | Float? | GPS latitude |
| gpsLng | Float? | GPS longitude |
| gpsAddress | String? | GPS reverse geocoded address |
| createdAt | DateTime | Transaction timestamp |

### **AuditLog** Table
| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| action | String | "create", "edit", "credit_post", "recovery_entry", "status_change" |
| entityType | String | "shop", "user", "transaction" |
| entityId | String? | Related entity ID |
| performedBy | String? | User who performed |
| oldValue | String? | JSON of old values |
| newValue | String? | JSON of new values |
| description | String? | Human readable description |
| createdAt | DateTime | Auto |

---

## 📱 App Screens & Features — COMPLETE LIST

### 🔐 SCREEN 1: Login Screen

**Design:**
- Dark navy blue gradient background (linear-gradient 135deg, #0F172A → #1E3A8A → #1E40AF)
- Glass morphism card in center
- Company logo (Building2 icon) in a circle with white/20 background
- "Al-Falah Traders" title (white, bold, 2xl)
- "Smart Credit & Route Management System" subtitle (blue-200)
- Subtle floating decorative circles with blur
- Star particles animation in background
- Grid overlay at 3% opacity

**Form Fields:**
1. Username input (text, with user icon)
2. Password input (with eye/eye-off toggle)
3. "Remember me" checkbox
4. "Forgot Password?" link
5. Sign In button (gradient blue, full width, h-11)
6. "Press Enter to sign in" keyboard hint

**Forgot Password View:**
1. "Back to login" arrow link
2. Username field
3. New Password field with password strength indicator:
   - Weak (red, < 6 chars)
   - Medium (amber, < 8 chars or no uppercase/number)
   - Strong (green, 8+ chars with uppercase + number)
4. Confirm Password field (green checkmark when match, red X when no match)
5. "Reset Password" button

**Reset Success View:**
- Green circle with shield-check icon
- "Password Reset!" heading
- "Sign In Now" button

**Behavior:**
- Auto-seed: On mount, call `/api/setup` POST to ensure tables exist
- On login: POST `/api/auth/login` with {username, password}
- Store session in SharedPreferences
- Navigate based on role: admin → Admin Dashboard, orderbooker → Orderbooker Dashboard
- Error: Card border turns red with shake animation

---

### 👨‍💼 SCREEN 2: Admin Dashboard

**Header (Sticky):**
- Navy gradient header bar (h-16)
- Hamburger menu button (mobile only)
- Al-Falah Traders logo + name (white)
- Global Search button (⌘K shortcut hint)
- User avatar (first letter) with name + "Administrator" label
- Change Password button
- Theme toggle (light/dark)
- Notification bell icon
- Share button
- Logout button

**Sidebar Navigation (Desktop: static, Mobile: drawer overlay):**
- Navy gradient sidebar (w-64)
- Branded section with logo + "Management Portal"
- Navigation items (with active state highlight):
  1. 🏠 Dashboard
  2. 💳 Credit Posting
  3. 📈 Recovery Report
  4. ✅ Approve Recovery
  5. 🧾 Transactions
  6. 🏪 Manage Shops
  7. 👥 Manage Orderbookers
  8. 📋 Reconciliation
  9. 🛡️ Audit Log
  10. 📊 OB Analytics
  11. 📅 Monthly Summary
  12. 📊 Activity
- **Live Recovery Ticker** at bottom (green, pulsing dot, "Today's Recovery: Rs. XXX")
- **Mini Stats** (Total Shops, Total OBs)

**Dashboard Content:**

1. **Welcome Banner** — Gradient card with:
   - "Welcome back, {name}" with current date
   - "{X} shops across {Y} orderbookers"

2. **KPI Cards** (2x2 grid on mobile, 4 columns on desktop):
   - 📤 Today's Credit (amber, animated counter)
   - 📥 Today's Recovery (green, animated counter)
   - 💰 Total Outstanding (red, animated counter)
   - 🏪 Total Active Shops (blue, animated counter)

3. **Monthly Overview Strip** — Horizontal scrollable:
   - Credit amount with % change vs last month (red arrow up = bad, green down = good)
   - Recovery amount with % change
   - Net Position with % change

4. **Pending Recovery Alert Banner** (orange, clickable):
   - "{X} Pending Recoveries"
   - "Total: Rs. {Y} — Click to review & approve"

5. **Quick Actions** (3 buttons in row):
   - 💳 Post Credit
   - 📈 Recovery Report
   - ➕ Add Shop

6. **Today's Key Metrics** (horizontal scrollable pills):
   - Total Credit Today
   - Total Recovery Today
   - Transactions count
   - Shops Active

7. **Recent Activity Feed** — List of latest transactions:
   - Each entry: icon (credit=amber↑, recovery=green↓), shop name, type badge, time ago, amount
   - "View All" link → Audit Log

8. **Live Recovery Feed** — Real-time recovery entries:
   - Green pulsing dot "Live"
   - Each entry with GPS indicator, amount, shop name, time
   - "Full Report" link

9. **Orderbooker Performance Cards** — Each OB card:
   - Name, total shops, total outstanding
   - Recovery sparkline (7-day SVG chart with interactive hover tooltips)
   - Click → OB Analytics

10. **Daily Credit/Recovery Trends** — Area chart (recharts):
    - Last 7-14 days
    - Credit (amber) and Recovery (green) areas
    - Net line

11. **Top 5 Debtors** — Bar chart:
    - Shop name on Y axis, balance on X axis
    - Red gradient bars

12. **Route Distribution** — Pie chart:
    - Shops per route day (Mon-Sat)
    - Different colors per day

---

### 💳 SCREEN 3: Credit Posting (Admin)

**Summary Cards Row:**
- 📦 Posted This Session (count) + Session Timer (MM:SS)
- ⚡ Quick Post toggle switch
- 💰 Total Outstanding (all displayed shops)
- 🏪 Shops Listed count

**Filters:**
- Orderbooker dropdown (All / specific OB)
- Search input (by shop name or area, debounced 300ms)
- Route Day tabs (All Days, Saturday, Sunday, Monday... Friday shown as dashed amber "off day")
- Today's day indicator (green dot)

**Stats Bar:**
- Total Shops | Outstanding | Avg Balance

**Shop List Table:**
| Shop Name | Area | Route | Balance (with credit limit) | Action |
Each row:
- Shop name (with search highlight)
- Credit limit indicator:
  - Green "Within Limit" badge
  - Amber "Near Limit" badge (> 80%)
  - Red "⚠ Over Limit" badge (pulsing)
- Balance (red if positive outstanding)
- "Add Credit" button

**Credit Dialog (Bottom Sheet or Modal):**
- Shop name + area (read-only)
- Current balance display
- Credit limit indicator (if set)
- Amount input (with live Rs. formatting)
- Description input (required, max 200 chars)
- Validation:
  - Min: Rs. 100
  - Max: Rs. 500,000
  - Daily cap: Rs. 100,000 per shop
- Duplicate credit warning (if already posted today for this shop)
- Credit limit warning (if will exceed after posting)
- "Post Credit" button

**Quick Post Mode:**
- Toggle ON → After posting, dialog stays open, amount clears, green checkmark appears for 1.5s
- Counter shows shops posted and total amount in session
- "Exit Quick Post" button

**Receipt Dialog (after posting):**
- Shop name, area, amount, description
- Previous Balance → New Balance
- Posted at timestamp
- Posted by name

**Today's Posting Summary (below shop list):**
- Date header with calendar icon
- List of shops with credit posted today:
  - Shop name, total amount, transaction count
  - "Edit" button (opens edit dialog)
  - "Delete" button (with confirmation)
  - Total at bottom

**Edit Transaction Dialog:**
- Shows all transactions for a shop today
- Edit amount and description per transaction
- Save with confirmation

---

### 📈 SCREEN 4: Recovery Report (Admin)

**Header:**
- "Recovery Report" title
- Date picker + "Today" / "Yesterday" quick buttons
- Refresh button with "Updated HH:MM" timestamp
- "Add Recovery" button (green)
- "Export CSV" button
- "Last updated" timestamp

**Summary Cards (3 columns):**
- 💵 Grand Total Recovery (green, animated)
- 👥 Active Orderbookers count
- 📍 Total Shops Visited count

**GPS Filter Tabs:**
- All | With GPS (count) | Without GPS (count)

**Orderbooker Accordion:**
Each OB section:
- **Header**: Avatar circle (first letter), name, phone, recovery % badge:
  - 🟢 Green "80%+" badge (≥80%)
  - 🟡 Amber "50%+" badge
  - 🔴 Red "Low" badge (<50%)
  - "{X}/{Y} shops visited"
  - Recovery amount
  - Expand/collapse arrow

- **Progress Bar** (when expanded):
  - Green portion = recovery collected
  - Amber portion = credit given
  - "Rs. X / Rs. Y recovered"

- **Shops Table** (expandable rows):
  | # | Shop | Area | Prev Balance | Credit | Recovery | Closing Balance | GPS |
  - Shop row expandable → shows individual recovery entries
  - Each entry: Time, Amount, Description, GPS indicator
  - "Settled" badge if closing balance = 0
  - GPS link to OpenStreetMap

- **Recovery Entry Actions:**
  - ✏️ Edit (amount, description)
  - 🗑️ Delete (with confirmation)

**Add Recovery Dialog:**
- Step 1: Select Orderbooker (dropdown)
- Step 2: Select Shop (filtered by OB)
- Step 3: Enter Amount + Description
- Submit → POST `/api/transactions`

**Empty State:**
- Empty illustration with icon
- "No recovery data for this date"
- "Try Another Date" button

---

### ✅ SCREEN 5: Approve Recovery (Admin)

**Purpose:** Orderbookers submit recovery from mobile app → it goes to "pending" status → Admin reviews and approves/rejects

**Summary Cards (4 columns):**
- ⏰ Pending count (orange)
- 💵 Total Pending Amount (green)
- 📱 Orderbookers count (blue)
- ☑️ Selected count (primary)

**Orderbooker Filter:**
- Pill buttons: All (count) | OB Name (count) | OB Name (count)...

**Bulk Action Bar** (when items selected):
- "{X} selected — Rs. {Y}"
- "Approve Selected" button (green)
- "Clear" button

**Pending Recovery List (grouped by OB):**
Each OB card:
- **Header**: Smartphone icon, OB name, phone, entry count badge, pending amount, expand/collapse
- **Select All** checkbox + "Approve All" button
- **Individual entries:**
  - Checkbox for selection
  - Shop name + area
  - Time ago (e.g., "15 min ago")
  - GPS indicator (green ✓ or red ✗)
  - Current balance
  - Description (italic, quoted)
  - Amount (green, bold)
  - **Approve** button (green, rounded)
  - **Reject** button (red, rounded)

**Reject Dialog:**
- "Reject Recovery" title (red)
- Warning text
- Reason textarea (optional)
- Cancel + Reject buttons

**Empty State:**
- Green checkmark circle "All Clear!"
- "No pending recoveries to review"
- "Check Again" button

**Auto-refresh**: Every 30 seconds

---

### 🧾 SCREEN 6: Transaction Management (Admin)

**Header:**
- "Transaction Management" title
- "{X} transactions total"
- "Add Transaction" button
- "Export CSV" button
- "Refresh" button

**Summary Cards (3 columns):**
- 📥 Total Credits (amber)
- 💵 Total Recoveries (green)
- 🧾 Net Effect (red if positive, green if negative)

**Filters:**
- Search by shop name
- Orderbooker dropdown filter
- Type tabs: All | Credits | Recoveries
- Date presets: All Time | Today | Yesterday | This Week | This Month
- Custom date picker
- "Reset Filters" button when active
- "{X} of {Y} transactions" result count

**Transaction Table:**
| # | Date & Time | Shop | Type | Amount | Prev Bal | New Bal | Description | Created By | Actions |

- Type badges: Credit (amber), Recovery (green)
- Amount colors: Credit = amber +, Recovery = green -
- Balance change colors: ↑ red, ↓ green
- Actions: ✏️ Edit, 🗑️ Delete

**Pagination:**
- "Showing X to Y of Z transactions"
- Page number buttons with prev/next

**Add Transaction Dialog:**
- Tab toggle: Recovery | Credit
- Shop search dropdown (filterable)
- Amount input
- Description input (optional)
- Submit button

**Edit Transaction Dialog:**
- Shop name (read-only)
- Type badge (read-only)
- Current amount display
- New amount input
- Description textarea
- Cancel + Save Changes buttons

**Delete Confirmation Dialog:**
- Warning icon + title
- "This action cannot be undone" warning
- Transaction details summary (shop, type, amount)
- Cancel + Delete buttons

---

### 🏪 SCREEN 7: Manage Shops (Admin)

**Header:**
- "Manage Shops" title
- "{X} shops total"
- "Add Shop" button (primary)
- "Export CSV" button

**Analytics Summary Cards (6 cards, 3-column grid):**
- 🏪 Active Shops (green, "Live" badge)
- 👥 Inactive Shops (red, "Off" badge)
- 💰 Total Outstanding (red)
- 📉 Average Balance (blue)
- 📊 Highest Balance Shop (red, with amount)
- 📍 Top Area (green, with shop count)

**Filters:**
- Search input
- Orderbooker dropdown
- "Show/Hide Inactive" toggle
- Route Day pill tabs (with shop counts per day)
- Today's day green dot indicator
- Non-working days (Friday) shown as dashed amber with ⚠ icon
- "Reset" button

**Shop Table:**
| ☑ | Name | Owner | Area | Route | Orderbooker | Balance | Credit Limit | Status | Actions |

**Credit Limit Column** (visual indicators):
- No limit → "—"
- Within limit → Green "Within Limit" badge + limit amount
- Near limit (>80%) → Amber "Near Limit" badge
- Over limit → Red "⚠ Over Limit" pulsing badge

**Row Actions:**
- 👁 View Details → Shop detail dialog
- ✏️ Edit → Edit shop dialog
- 📖 View Ledger → Ledger dialog with PDF download
- 📊 View Analytics → Shop Detail Analytics page
- 👤 Deactivate (only if active)

**Bulk Operations:**
- Select All checkbox
- Selected shops bar: Bulk Assign | Bulk Deactivate | Bulk Reactivate
- Bulk Assign: Select target OB from dropdown
- Confirmation dialogs for each

**Add/Edit Shop Dialog:**
- Shop Name (required)
- Owner Name
- Area
- Address
- Phone
- Route Day (required, dropdown)
- Assigned Orderbooker (required, dropdown)
- Credit Limit (optional, number input)
- Save / Cancel buttons

**Ledger Dialog:**
- Shop name header
- Running balance at top
- Transaction list (chronological):
  - Date, Type badge, Description, Amount, Prev Bal → New Bal
- "Download PDF" button
- "Download CSV" button

---

### 👥 SCREEN 8: Manage Orderbookers (Admin)

**Features:**
- List of all orderbookers with:
  - Name, phone, username
  - Status badge (Active/Inactive)
  - Total shops assigned
  - Total outstanding amount
- Add new orderbooker (name, username, phone, password)
- Edit orderbooker
- Activate/Deactivate orderbooker
- View orderbooker profile + analytics

---

### 📋 SCREEN 9: Reconciliation (Admin)

**Purpose:** Compare shop balances vs transaction history to find discrepancies

**Features:**
- Date selection
- List of shops with:
  - Expected balance (from transaction history)
  - Actual balance (from shop record)
  - Difference (highlighted if mismatch)
  - Status: "Matched" (green) or "Discrepancy" (red)
- Export reconciliation report

---

### 🛡️ SCREEN 10: Audit Log (Admin)

**Purpose:** Complete activity history of everything that happened

**Features:**
- Chronological list of all actions:
  - Who did what, when, to which entity
  - Old values → New values (JSON)
  - Action type badges (create=green, edit=blue, delete=red)
- Entity type filters
- Date range filters
- User filter
- Export

---

### 📊 SCREEN 11: OB Analytics (Admin)

**Purpose:** Detailed analytics for each orderbooker

**Features:**
- OB selector (tabs or dropdown)
- Performance metrics:
  - Total shops, total outstanding
  - Recovery rate percentage
  - Weekly recovery sparkline
- Shop list for selected OB with balances
- Route day distribution

---

### 📅 SCREEN 12: Monthly Summary (Admin)

**Features:**
- Month selector
- Summary cards:
  - Total Credit
  - Total Recovery
  - Net Position
  - Transaction Count
- Comparison with previous month (% change)
- Weekly breakdown chart
- Daily credit/recovery trend

---

### 📊 SCREEN 13: Activity Timeline (Admin)

**Features:**
- Real-time feed of all activities
- Grouped by date (Today, Yesterday, etc.)
- Each entry: type icon, shop name, area, amount, balance after, performer, time
- Filter by type (credit/recovery)

---

## 📱 ORDERBOOKER (Field Worker) SCREENS

### 🗺️ SCREEN O1: Orderbooker Dashboard (My Route)

**Header:**
- Green gradient header (from-[#065F46] to-[#047857])
- Online/Offline indicator dot (green=online, amber=offline)
- Al-Falah Traders logo + "Orderbooker Portal"
- User avatar + Logout button
- Change Password button
- Settings button
- Share button
- Current date display

**Offline Banner** (when offline):
- Amber banner: "You're offline. Shops loaded from cache. Recovery will be queued."
- Sync banner (when pending): "{X} pending recoveries — Sync Now" button

**Content:**
- Today's route day badge
- Shop count for today
- Pull-to-refresh

**Shop Cards** (for today's route):
Each card:
- Shop name (bold)
- Owner name
- Area + phone
- Balance (red if > 0)
- Credit limit indicator (if set)
- "Collect Recovery" button (green)
- Distance/direction hint

**Recovery Collection Flow:**
1. Tap "Collect Recovery" on shop card
2. Bottom sheet opens:
   - Shop name + area
   - Current balance (read-only)
   - Amount input (with Rs. formatting)
   - Description/note input (optional)
   - GPS location capture (auto, with loading indicator)
   - GPS address display (from reverse geocoding)
   - "Submit Recovery" button (green)
3. On submit:
   - GPS coordinates captured automatically
   - Recovery goes to "pending" status (needs admin approval)
   - Success overlay animation (green checkmark, amount, shop name)
   - Auto-dismiss after 2 seconds

**Success Overlay:**
- Full screen overlay with semi-transparent background
- Rounded card with green checkmark icon (animated bounce)
- "Recovery Collected!" text
- Shop name
- Amount in large green text (animated count-up)

---

### 📜 SCREEN O2: Recovery History (Orderbooker)

**Features:**
- Header with clock icon + "Recovery History"
- Summary row: Entries | Total Recovered | Avg/Entry
- Date range filter tabs: Last 7 days | Last 30 days | All Time
- Grouped by date:
  - Date header with day name, entry count, day total
  - Individual entries:
    - Shop name, GPS indicator (green dot), area, time
    - Amount (green, bold)
    - GPS/No GPS label

**Empty State:**
- Clock icon illustration
- "No recovery history yet"
- "Start collecting recovery from shops"

---

### 📖 SCREEN O3: Shop Ledger (Orderbooker)

**Features:**
- Back arrow
- Shop search
- Select a shop → View full ledger:
  - Running balance at top
  - All transactions (credit + recovery)
  - Download PDF option
- Bottom sheet view (slide up)

---

### 👤 SCREEN O4: Profile (Orderbooker)

**Features:**
- Profile card with gradient header:
  - Avatar (initials in circle)
  - Name, username, phone
  - "Orderbooker" role badge

- **Performance Stats** (current month):
  - 💰 Total Recovery (green)
  - 📍 Shops Visited (blue)
  - 📊 Avg/Visit (amber)

- **Weekly Performance** (last 4 weeks):
  - Total Recovered | Daily Average | Best Single Day
  - Week-by-week bar chart (green for best, amber for lowest)
  - "Best day: {date} — Rs. {amount}" callout

- **Quick Actions:**
  - 🔑 Change Password
  - ⚙️ Settings (backup, sync)
  - 📤 Share Profile

---

## 🔧 API Endpoints (Backend Reference)

Flutter app ko yeh endpoints use karne hain (same backend as website):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/reset-password` | Reset password |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/auth/validate` | Validate session |
| POST | `/api/setup` | Auto-setup DB |
| GET | `/api/shops` | List shops (query: search, routeDay, orderbookerId, includeInactive) |
| POST | `/api/shops` | Create shop |
| PATCH | `/api/shops` | Update shop |
| GET | `/api/orderbookers` | List orderbookers |
| POST | `/api/orderbookers` | Create orderbooker |
| PATCH | `/api/orderbookers` | Update orderbooker |
| GET | `/api/transactions` | List transactions (query: date, type, shopId, createdBy, page, limit) |
| POST | `/api/transactions` | Create transaction (credit/recovery) |
| PATCH | `/api/transactions` | Update transaction |
| DELETE | `/api/transactions` | Delete transaction |
| GET | `/api/recoveries?status=pending` | Get pending recoveries |
| POST | `/api/recoveries` | Approve/reject recovery (action: approve/reject, transactionIds) |
| PATCH | `/api/shops/bulk-assign` | Bulk assign shops to OB |
| PATCH | `/api/shops/bulk-status` | Bulk activate/deactivate shops |
| GET | `/api/summary` | Business summary |
| GET | `/api/reports/recovery-summary?date=` | Recovery report data |
| GET | `/api/reports/ledger?shopId=` | Shop ledger |
| GET | `/api/reports/daily-trends` | Daily credit/recovery trends |
| GET | `/api/reports/month-summary` | Monthly summary |
| GET | `/api/reports/activity-timeline` | Activity feed |
| GET | `/api/reports/ob-performance` | OB performance |
| GET | `/api/reports/ob-weekly-performance` | OB weekly performance |
| GET | `/api/reports/ob-recovery-sparkline` | 7-day sparkline data |
| GET | `/api/reports/reconciliation` | Reconciliation data |
| GET | `/api/reports/shop-detail` | Shop analytics |
| GET | `/api/reports/shop-balance-trend` | Shop balance over time |
| GET | `/api/audit` | Audit log |

---

## 🎨 Design System & UI Standards

### Color Palette:
- **Primary**: Blue (#1E3A8A, #2563EB, #3B82F6)
- **Admin Header/Sidebar**: Navy gradient (#0F172A → #1E40AF)
- **OB Header**: Green gradient (#065F46 → #047857)
- **Credit**: Amber (#F59E0B, #D97706)
- **Recovery**: Green (#10B981, #059669)
- **Danger/Outstanding**: Red (#EF4444, #DC2626)
- **Success**: Green (#10B981)
- **Warning**: Amber (#F59E0B)
- **Background**: White (light) / Dark slate (dark mode)

### Typography:
- Headings: Bold, tight tracking
- Body: Regular weight
- Numbers: Tabular nums (monospace for amounts)
- Currency: "Rs. {amount}" format (Pakistani Rupees, no decimals)

### Components Style:
- **Cards**: Rounded corners (xl/2xl), subtle shadow, hover lift effect
- **Buttons**: Rounded, with ripple effect on tap
- **Badges**: Small, rounded-full, color-coded
- **Tables**: Alternating row colors (even/odd), sticky headers
- **Inputs**: h-11 height, with focus glow effect
- **Navigation**: Active state with white/15 background + border
- **Loading**: Skeleton shimmer effect, spinner
- **Empty States**: Illustration with icon, description, action button
- **Toasts**: Success (green), Error (red), Warning (amber)

### Animations:
- Card entrance (fade-in + slide-up)
- Number counters (animated counting)
- Pulse effects (live indicators)
- Hover lift (scale 1.02)
- Success bounce (recovery collected overlay)
- Shimmer loading skeletons
- Page transitions (fade-in)

### Dark Mode:
- Full dark mode support
- Toggle in header
- Persisted preference

---

## ⚡ Special Features & Business Logic

### 1. GPS Tracking
- Auto-capture GPS when orderbooker submits recovery
- Display GPS coordinates + reverse geocoded address
- GPS indicator: 🟢 GPS captured / 🔴 No GPS
- Link to OpenStreetMap for location view
- Filter recoveries by GPS status

### 2. Offline Support (Orderbooker App)
- Cache shops locally when online
- Queue recovery transactions when offline
- Show offline banner
- Auto-sync when back online
- Pending sync counter with "Sync Now" button
- Pending recovery card showing queued items

### 3. Credit Limits
- Per-shop credit limit (optional)
- Visual indicators: Within Limit (green), Near Limit (amber >80%), Over Limit (red >100%)
- Warning when posting credit that would exceed limit
- Recovery cannot exceed shop balance

### 4. Transaction Validation
- Min amount: Rs. 100
- Max amount: Rs. 500,000
- Daily credit cap: Rs. 100,000 per shop
- Description required for credit posting
- Duplicate credit detection (same shop, same day)

### 5. Recovery Approval Flow
- Orderbooker submits recovery → status: "pending"
- Admin sees pending recoveries in "Approve Recovery" screen
- Admin approves → balance updates, status: "approved"
- Admin rejects → balance unchanged, status: "rejected" + reason
- Dashboard banner shows pending count

### 6. Route System
- 6 working days: Saturday through Thursday
- Friday = off day
- Each shop assigned a route day
- Today's route auto-detected based on Pakistan timezone (Asia/Karachi)
- Route day filter tabs with shop counts

### 7. Quick Post Mode (Credit Posting)
- Toggle ON to rapidly post credits without closing dialog
- Counter shows shops posted + total amount
- Green checkmark animation after each post
- Session timer (MM:SS)

### 8. PDF Generation
- Shop ledger PDF download
- Professional format with company branding

### 9. CSV Export
- Shops list export
- Transactions export
- Recovery report export

### 10. Session Management
- JWT-like token stored in SharedPreferences
- Auto-login with "Remember me"
- Session timeout warning dialog
- Logout clears session

### 11. Global Search
- Search across shops, orderbookers, transactions
- Keyboard shortcut (Cmd/Ctrl + K) on desktop
- Modal overlay with search results

### 12. Notifications
- Bell icon with unread count badge
- Notification panel with list of recent events
- Auto-refresh data periodically

---

## 🏗️ Recommended Flutter Architecture

### State Management:
- **Provider** or **Riverpod** for global state
- **shared_preferences** for session/token storage

### Networking:
- **dio** HTTP client
- Base URL: `https://alfalah-traders.vercel.app`
- Auth token in headers
- Error handling with toast/snackbar

### Local Storage (Offline):
- **hive** or **sqflite** for caching shops
- Queued transactions for offline sync

### GPS:
- **geolocator** package
- Auto-capture on recovery submission
- **geocoding** for reverse geocoding

### PDF Generation:
- **pdf** package or **printing** package

### Charts:
- **fl_chart** for line/bar/pie charts
- Custom sparkline widget

### Navigation:
- **go_router** for typed routing
- Bottom navigation for orderbooker
- Drawer + bottom navigation for admin

### UI Components:
- **Material 3** design system
- Custom widgets matching the website's design
- Glass morphism effects with **BackdropFilter**

---

## 📐 Screen Layout Guidelines

### Admin (Tablet-Focused):
- Side navigation (drawer on mobile)
- Content area with max-width container
- Cards with consistent padding (p-4 or p-6)
- Tables with horizontal scroll on mobile

### Orderbooker (Mobile-First):
- Bottom navigation bar (4 tabs): My Route | History | Ledger | Profile
- Green header theme
- Card-based shop list
- Bottom sheets for data entry
- Pull-to-refresh
- Floating action button for quick recovery

---

## ✅ Key Requirements

1. **Roles**: Admin and Orderbooker with different UIs
2. **API Integration**: Same REST API as the website
3. **Offline Support**: Essential for orderbookers in the field
4. **GPS Tracking**: Auto-capture on recovery submission
5. **Dark Mode**: Full support
6. **Responsive**: Works on phone and tablet
7. **Real-time**: Auto-refresh data every 30 seconds
8. **Pakistan Timezone**: All dates in Asia/Karachi
9. **Urdu/English**: UI in English, but developer should understand Urdu
10. **Currency**: Pakistani Rupees (Rs.) format

---

## 🚀 Build & Deployment

- Target: Android APK (primary)
- Min SDK: 21 (Android 5.0)
- Target SDK: 34 (Android 14)
- Release build with ProGuard/R8
- App signing configuration
- Play Store ready

---

**Note for Developer:** Yeh prompt complete system ka description hai. Website pe jaake `https://alfalah-traders.vercel.app` dekh sakte ho live demo. Admin credentials se login karke saare features dekh lo. Design exact match ho website ke saath — colors, layout, animations sab same hona chahiye. Flutter mein bohot clean aur professional code likhein with proper folder structure.

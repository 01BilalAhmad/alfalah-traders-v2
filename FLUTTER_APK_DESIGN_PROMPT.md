# Al-Falah Traders — Order Booker Flutter APK Design Prompt

## Project Overview

**App Name:** Al-Falah Traders — Order Booker App  
**Purpose:** A mobile app for field order bookers (sales agents) who visit shops daily to **collect credit recovery (payments)**, **view shop ledger/account statements**, and **see shop information**. This is a companion app to an existing web-based admin system.  
**Target Users:** Order bookers (field agents) working for a wholesale trading business in Pakistan  
**Language:** Urdu (RTL-ready) + English  
**Currency:** Pakistani Rupees (PKR) — format as "Rs. X,XXX"  
**Platform:** Android APK (Flutter)  

---

## Core Features (ONLY These 3)

1. **Recovery Collection** — Order booker collects payment from shops
2. **Shop Ledger** — View shop's full account statement (credit + recovery history)
3. **Shop Information** — View assigned shops list with details

---

## User Flow

```
Login Screen
    ↓
Main Screen (Bottom Navigation: 3 Tabs)
    ├── Tab 1: Today's Route (Shops) — with Recovery Collection
    ├── Tab 2: Shop Ledger
    └── Tab 3: My Profile (basic info + change password + logout)
```

---

## Screen-by-Screen Design

### SCREEN 1: Login Screen

**UI Elements:**
- App logo at top (Al-Falah Traders branding)
- Username (text input field)
- Password (password input field with eye toggle)
- "Login" button (full-width, prominent)
- Clean, simple design — white background

**Behavior:**
- Call API: `POST /api/auth/login` with `{ username, password }`
- On success: Store auth token/session, navigate to Main Screen
- On failure: Show error message "Invalid username or password"
- No "Remember Me" or "Server Settings" — keep it simple

---

### SCREEN 2: Today's Route (Tab 1 — Home)

**Purpose:** Shows today's assigned shops based on route day (Saturday to Thursday). Friday is off.

**Header Section:**
- "Today's Route" title with current date (e.g., "Monday, 15 Jan 2025")
- Route day badge (e.g., "Monday Route")
- Visit progress bar: "Visited: 5/12 shops"
- Online/Offline status indicator (green dot = online, amber = offline)

**Quick Stats Row (3 small cards):**
1. Total Shops (assigned to this orderbooker for today's route day)
2. Total Outstanding (sum of all today's shops' balances)
3. Today's Recovery (total recovered today so far)

**Shop Cards List (scrollable):**
Each shop card should show:
- **Shop Name** (bold, large)
- **Area** (subtle text)
- **Owner Name**
- **Balance** (prominent — RED if > 0, GREEN if 0)
- **Credit Limit** with utilization bar (green/amber/red based on usage %)
- **Over Limit warning badge** if balance > creditLimit
- **✓ Visited** indicator if recovery already collected today for this shop
- **"Collect Recovery"** button (primary action)
- **📞 Call** button (opens phone dialer with shop's phone number)

**Shop Card Tap → Shop Detail Dialog/Screen:**
- Shop name + owner name
- Area, address, phone
- Balance + Credit Limit cards
- Credit limit progress bar
- Recent transactions (last 5)
- "Collect Recovery" button at bottom
- "Call Shop" button

**Pull to Refresh** — refreshes shop list and recovery status

---

### SCREEN 3: Recovery Collection (Bottom Sheet / Dialog)

**Triggered by:** Tapping "Collect Recovery" on any shop card

**UI Elements:**
- Header: "Collect Recovery — [Shop Name]"
- **Amount Input Field** (number keypad, PKR)
- **Quick Amount Buttons:** Rs. 500 | Rs. 1,000 | Rs. 2,000 | Rs. 5,000 | Rs. 10,000
- **Note/Description Input** (optional — e.g., "Cash received")
- **GPS Location Section:**
  - "Capture Location" button with 📍 icon
  - When tapped: Get GPS coordinates + show on map
  - Display: Lat/Lng coordinates + approximate address
  - This is optional but encouraged
- **"Submit Recovery"** button (large, green/primary color)

**Behavior:**
- Call API: `POST /api/transactions` with body:
  ```json
  {
    "shopId": "shop_cuid",
    "type": "recovery",
    "amount": 5000,
    "description": "Cash received",
    "gpsLat": 24.8607,
    "gpsLng": 67.0011,
    "gpsAddress": "Street name..."
  }
  ```
- Recovery goes to admin for **approval** (status = "pending")
- **Offline Support:** If no network, save to local storage queue and sync when online
- On success: Show success animation/overlay with "Rs. 5,000 recovered from [Shop Name]"
- Amount validation: Min Rs. 100, Max Rs. 500,000

**Success Overlay:**
- Green checkmark animation
- "Recovery Submitted!" text
- Shop name + amount
- "Note: Pending admin approval" small text
- Auto-dismiss after 2 seconds

---

### SCREEN 4: Shop Ledger (Tab 2)

**Step 1: Shop Selection**
- Dropdown or searchable list of all shops assigned to this orderbooker
- Each item shows: Shop Name + Balance
- On select → Show ledger

**Step 2: Ledger View**

**Summary Cards (top):**
1. **Total Credit** — Sum of all credit transactions (amber/orange color)
2. **Total Recovery** — Sum of all recovery transactions (green color)
3. **Current Balance** — Running balance (red if > 0)

**Transactions List (scrollable, newest first):**
Each transaction row:
- **Date & Time** (formatted: "15 Jan 2025, 2:30 PM")
- **Type Badge:** "CREDIT" (amber) or "RECOVERY" (green)
- **Amount** (bold)
- **Previous Balance → New Balance**
- **Description** (if any)
- **Created By** (orderbooker/admin name)

**API Call:**
- `GET /api/reports/ledger?shopId={shopId}`

**Response Format:**
```json
{
  "shop": { "id", "name", "ownerName", "area", "balance", "creditLimit", ... },
  "transactions": [
    {
      "id": "...",
      "type": "recovery",
      "amount": 5000,
      "previousBalance": 25000,
      "newBalance": 20000,
      "description": "Cash",
      "createdAt": "2025-01-15T14:30:00Z",
      "creator": { "name": "Ali Ahmed" }
    }
  ],
  "summary": {
    "totalCredit": 150000,
    "totalRecovery": 130000,
    "totalTransactions": 45,
    "currentBalance": 20000
  }
}
```

**PDF Download Button** (optional but recommended):
- Generate and download PDF of the ledger
- A4 format with:
  - Company header "Al-Falah Traders — Account Statement"
  - Shop info (name, owner, area, phone, address)
  - Summary cards
  - Transactions table
  - Date printed at bottom

---

### SCREEN 5: My Profile (Tab 3)

**UI Elements:**
- Profile avatar/icon with orderbooker name
- **Name:** Display name
- **Username:** Display username
- **Phone:** Display phone number
- **Role:** "Order Booker" badge

**Performance Stats (small cards):**
- This Month's Recovery Total
- Shops Assigned
- Today's Recovery

**Change Password Section:**
- Current Password input
- New Password input
- Confirm New Password input
- "Change Password" button
- API: `POST /api/auth/change-password`

**Logout Button** (at bottom, red):
- Clears session/token
- Returns to Login screen

---

## API Endpoints Used (Backend Already Exists)

The web backend is already live. The Flutter app only needs to call these APIs:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/validate` | Check if session is valid |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/shops?orderbookerId={id}&routeDay={day}` | Get today's route shops |
| GET | `/api/shops?orderbookerId={id}` | Get all assigned shops |
| POST | `/api/transactions` | Submit recovery |
| GET | `/api/transactions?shopId={id}&type=recovery&limit=10` | Shop recent transactions |
| GET | `/api/reports/ledger?shopId={id}` | Full shop ledger |
| GET | `/api/reports/recovery-summary?date=2025-01-15` | Today's recovery summary |
| GET | `/api/summary` | Business summary (outstanding, etc.) |

**Base URL:** `https://alfalah-traders.vercel.app`  
**Auth:** Token-based (JWT or session cookie from login response)

---

## Data Models (For Reference)

### User
```
id, username, password, name, role, phone, status, createdAt
```

### Shop
```
id, name, ownerName, area, address, phone, routeDay, 
orderbookerId, balance (running), creditLimit, status
```

### Transaction
```
id, shopId, type ("credit"/"recovery"), status ("pending"/"approved"/"rejected"),
amount, previousBalance, newBalance, description, createdBy,
approvedBy, gpsLat, gpsLng, gpsAddress, createdAt
```

---

## Key Business Rules

1. **Recovery submissions are PENDING** — Admin must approve before balance updates
2. **Credit is auto-approved** by admin only (order bookers don't post credit)
3. **Route Days:** Saturday to Thursday (Friday = off)
4. **Amount Range:** Min Rs. 100, Max Rs. 500,000 per recovery
5. **Balance Logic:** Credit INCREASES balance, Recovery DECREASES balance
6. **Credit Limit:** If shop balance exceeds creditLimit, show "Over Limit" warning
7. **GPS Capture:** Optional but recommended for verification

---

## Design & UI Guidelines

### Color Palette
- **Primary Color:** Emerald Green (#059669) — for primary buttons, success states
- **Secondary:** Amber (#F59E0B) — for credit amounts, warnings
- **Danger:** Red (#EF4444) — for overdue balances, over-limit warnings
- **Background:** White (#FFFFFF) with light gray (#F9FAFB) sections
- **Text:** Dark gray (#111827) for primary, medium gray (#6B7280) for secondary

### Typography
- Use a clean, modern font (Inter or Roboto)
- Urdu text support required (Noto Nastaliq Urdu for any Urdu text)
- Numbers in English/Latin numerals

### Design Style
- **Material Design 3** (Android native feel)
- Cards with subtle shadows and rounded corners (12px border radius)
- Bottom navigation with icons + labels
- Smooth animations for transitions and success states
- Mobile-first — optimized for phone screens (360dp-412dp width)

### Navigation
- Bottom navigation bar with 3 tabs:
  1. 🏠 Route (Today's shops + recovery)
  2. 📖 Ledger (Shop account statement)
  3. 👤 Profile
- No hamburger menu or sidebar
- Back button on sub-screens

### Offline Support (IMPORTANT)
- Cache shop list locally (SQLite or Hive)
- Queue recovery submissions when offline
- Show "Offline" banner at top
- Auto-sync queued recoveries when back online
- Show pending sync count

### Push Notifications (Optional)
- Notify when recovery is approved by admin

---

## Screens Summary

| # | Screen | Description |
|---|--------|-------------|
| 1 | Login | Username + Password → Auth |
| 2 | Today's Route | Shop cards list with recovery buttons |
| 3 | Recovery Dialog | Amount input + GPS + Submit |
| 4 | Shop Detail | Shop info + recent transactions |
| 5 | Shop Ledger | Full account statement with summary |
| 6 | My Profile | User info + change password + logout |

---

## Technical Requirements

- **Framework:** Flutter (Dart)
- **Min SDK:** Android 6.0 (API 23)
- **Target SDK:** Android 14 (API 34)
- **State Management:** Provider or Riverpod
- **Local Storage:** SQLite (sqflite) or Hive for offline cache
- **HTTP Client:** Dio or http package
- **GPS:** geolocator package
- **PDF Generation:** pdf package or syncfusion_flutter_pdf
- **Notifications:** firebase_messaging (optional)
- **Language:** Support both English and Urdu

---

## Important Notes for Developer

1. The **backend API is already built and live** at `https://alfalah-traders.vercel.app` — you only need to build the Flutter frontend
2. **Login response** returns user data with `id`, `name`, `role`, `token` — use this for API calls
3. **Shops are filtered by `orderbookerId`** — after login, use the user's ID to fetch their shops
4. **Route day filtering** — filter shops by today's day name (lowercase: "monday", "tuesday", etc.)
5. **Recovery goes to pending** — after submission, tell user it's pending admin approval
6. **Balance shown on shops is the CURRENT balance** (including pending recoveries)
7. Keep the UI **simple and fast** — order bookers use this in the field on mobile data
8. **GPS is optional** but add it — it helps admin verify recoveries
9. The app should feel like a **native Android app** — smooth, fast, no web views

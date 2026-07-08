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

## API Endpoints — COMPLETE DOCUMENTATION

**Base URL:** `https://alfalah-traders.vercel.app`  
**Auth:** No API key required! No Bearer token needed! APIs are open — just call them directly.
**Content-Type:** All POST/PATCH requests use `application/json`

> ⚠️ **IMPORTANT FOR DEVELOPER:** 
> Kisi bhi API key, Bearer token, ya authentication header ki zaroorat NAHI hai.
> Server pe koi auth middleware nai hai. Directly API call karo — response mil jayega.
> Sirf login API ko username/password body mein bhejo, baaki sab APIs bina kisi key ke chal jayengi.

---

### 1. Login

```
POST /api/auth/login
```

**Request Body:**
```json
{
  "username": "ali",
  "password": "mypassword123"
}
```

**Success Response (200):**
```json
{
  "user": {
    "id": "clxabc123def",
    "username": "ali",
    "name": "Ali Ahmed",
    "role": "orderbooker",
    "phone": "03001234567",
    "status": "active",
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "token": "session-clxabc123def-1704067200000"
}
```

**Error Responses:**
- `400` — `{ "error": "Username and password are required" }`
- `401` — `{ "error": "Invalid credentials" }`
- `403` — `{ "error": "Account is deactivated" }`

**Flutter Usage:**
```
Save user.id → use as orderbookerId in all shop/transaction APIs
Save user.name → display in profile
Token ko save karna optional hai — server koi token validate nai karta
```

---

### 2. Validate Session (Health Check)

```
GET /api/auth/validate
```

**Response (200):**
```json
{
  "status": "ok",
  "app": "Al-Falah Traders",
  "timestamp": "2025-01-15T14:30:00.000Z"
}
```

**Flutter Usage:**
```
Call this on app start to check if server is reachable.
If this fails → show "Server not reachable" message.
```

---

### 3. Change Password

```
POST /api/auth/change-password
```

**Request Body:**
```json
{
  "userId": "clxabc123def",
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

> Note: You can use `username` instead of `userId` if needed.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `400` — `{ "error": "Current password and new password are required" }`
- `400` — `{ "error": "New password must be at least 6 characters long" }`
- `401` — `{ "error": "Current password is incorrect" }`
- `400` — `{ "error": "New password must be different from the current password" }`
- `404` — `{ "error": "User not found" }`

---

### 4. Get Shops (Today's Route + All Shops)

```
GET /api/shops?orderbookerId={userId}&routeDay={day}
GET /api/shops?orderbookerId={userId}
GET /api/shops?orderbookerId={userId}&search={keyword}
```

**Query Parameters (all optional):**
| Parameter | Example | Description |
|-----------|---------|-------------|
| `orderbookerId` | `clxabc123def` | Filter by orderbooker (use login user.id) |
| `routeDay` | `monday` | Filter by day (lowercase: monday, tuesday, ... saturday) |
| `search` | `karachi` | Search shop name, area, or owner name |
| `includeInactive` | `true` | Include inactive shops (default: false) |

**Success Response (200) — Array of shops:**
```json
[
  {
    "id": "clxshop001",
    "name": "Al-Madina General Store",
    "ownerName": "Muhammad Akram",
    "area": "Gulshan-e-Iqbal",
    "address": "Block 13, Shop #5",
    "phone": "02134567890",
    "routeDay": "monday",
    "orderbookerId": "clxabc123def",
    "balance": 25000,
    "creditLimit": 50000,
    "status": "active",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z",
    "orderbooker": {
      "id": "clxabc123def",
      "name": "Ali Ahmed"
    }
  },
  {
    "id": "clxshop002",
    "name": "City Super Market",
    "ownerName": "Ahmed Khan",
    "area": "Nazimabad",
    "address": "Block 4, Main Market",
    "phone": "02198765432",
    "routeDay": "monday",
    "orderbookerId": "clxabc123def",
    "balance": 75000,
    "creditLimit": 50000,
    "status": "active",
    "createdAt": "2025-01-05T00:00:00.000Z",
    "updatedAt": "2025-01-14T08:00:00.000Z",
    "orderbooker": {
      "id": "clxabc123def",
      "name": "Ali Ahmed"
    }
  }
]
```

**Flutter Usage:**
```
// Today's route shops:
GET /api/shops?orderbookerId={userId}&routeDay=monday

// All my shops (for Ledger tab):
GET /api/shops?orderbookerId={userId}

// Calculate today's day name in Dart:
// DateTime.now().weekday returns 1=Monday, 7=Sunday
// Convert to lowercase: ['monday','tuesday',...,'saturday'][weekday-1]
// Friday (weekday=6) → show "Holiday" / no shops
```

---

### 5. Submit Recovery (Create Transaction)

```
POST /api/transactions
```

**Request Body:**
```json
{
  "shopId": "clxshop001",
  "type": "recovery",
  "amount": 5000,
  "createdBy": "clxabc123def",
  "description": "Cash received",
  "gpsLat": 24.8607,
  "gpsLng": 67.0011,
  "gpsAddress": "Gulshan-e-Iqbal Block 13"
}
```

**Required Fields:** `shopId`, `type`, `amount`, `createdBy`  
**Optional Fields:** `description` (max 200 chars), `gpsLat`, `gpsLng`, `gpsAddress`

**Validation Rules:**
- Min amount: Rs. 100
- Max amount: Rs. 500,000
- Recovery cannot exceed shop's current balance
- Description max: 200 characters
- Type must be `"recovery"` (order bookers don't post credit)

**Success Response (201):**
```json
{
  "id": "clxtxn001",
  "shopId": "clxshop001",
  "type": "recovery",
  "status": "pending",
  "amount": 5000,
  "previousBalance": 25000,
  "newBalance": 25000,
  "description": "Cash received",
  "createdBy": "clxabc123def",
  "approvedBy": null,
  "approvedAt": null,
  "gpsLat": 24.8607,
  "gpsLng": 67.0011,
  "gpsAddress": "Gulshan-e-Iqbal Block 13",
  "createdAt": "2025-01-15T14:30:00.000Z",
  "shop": {
    "id": "clxshop001",
    "name": "Al-Madina General Store"
  },
  "creator": {
    "id": "clxabc123def",
    "name": "Ali Ahmed"
  }
}
```

> **IMPORTANT:** `status` will be `"pending"` — admin needs to approve. Balance does NOT change until approved. Show "Pending Admin Approval" to user.

**Error Responses:**
- `400` — `{ "error": "Shop, type, amount, and creator are required" }`
- `400` — `{ "error": "Minimum transaction amount is Rs. 100" }`
- `400` — `{ "error": "Maximum single transaction amount is Rs. 500,000" }`
- `404` — `{ "error": "Shop not found" }`
- `400` — `{ "error": "Recovery amount (Rs. 50,000) exceeds shop balance (Rs. 25,000). Maximum recovery allowed: Rs. 25,000" }`

---

### 6. Get Transactions (Recovery History)

```
GET /api/transactions?shopId={shopId}&type=recovery&limit=10
GET /api/transactions?createdBy={userId}&date=2025-01-15
GET /api/transactions?orderbookerId={userId}&type=recovery&limit=50
```

**Query Parameters (all optional):**
| Parameter | Example | Description |
|-----------|---------|-------------|
| `shopId` | `clxshop001` | Filter by shop |
| `orderbookerId` | `clxabc123def` | Filter by orderbooker's shops |
| `createdBy` | `clxabc123def` | Filter by who created |
| `type` | `recovery` | `credit` or `recovery` |
| `date` | `2025-01-15` | Filter by date (YYYY-MM-DD) |
| `startDate` | `2025-01-01` | From this date onwards |
| `page` | `1` | Page number (default: 1) |
| `limit` | `50` | Items per page (default: 50) |

**Success Response (200):**
```json
{
  "transactions": [
    {
      "id": "clxtxn001",
      "shopId": "clxshop001",
      "type": "recovery",
      "status": "pending",
      "amount": 5000,
      "previousBalance": 25000,
      "newBalance": 25000,
      "description": "Cash received",
      "createdBy": "clxabc123def",
      "approvedBy": null,
      "approvedAt": null,
      "rejectReason": null,
      "gpsLat": 24.8607,
      "gpsLng": 67.0011,
      "gpsAddress": "Gulshan-e-Iqbal Block 13",
      "createdAt": "2025-01-15T14:30:00.000Z",
      "shop": {
        "id": "clxshop001",
        "name": "Al-Madina General Store",
        "area": "Gulshan-e-Iqbal"
      },
      "creator": {
        "id": "clxabc123def",
        "name": "Ali Ahmed",
        "role": "orderbooker"
      }
    }
  ],
  "total": 45,
  "page": 1,
  "totalPages": 1
}
```

**Flutter Usage:**
```
// Today's recoveries by me:
GET /api/transactions?createdBy={userId}&type=recovery&date=2025-01-15

// Recent recoveries for a shop (shop detail screen):
GET /api/transactions?shopId={shopId}&type=recovery&limit=5

// All my recoveries (history):
GET /api/transactions?createdBy={userId}&type=recovery&limit=100
```

---

### 7. Get Shop Ledger (Full Account Statement)

```
GET /api/reports/ledger?shopId={shopId}
```

**Query Parameters:**
| Parameter | Example | Description |
|-----------|---------|-------------|
| `shopId` | `clxshop001` | **Required** — Shop ID |
| `limit` | `50` | Optional — Limit transactions |

**Success Response (200):**
```json
{
  "shop": {
    "id": "clxshop001",
    "name": "Al-Madina General Store",
    "ownerName": "Muhammad Akram",
    "area": "Gulshan-e-Iqbal",
    "address": "Block 13, Shop #5",
    "phone": "02134567890",
    "routeDay": "monday",
    "balance": 20000,
    "orderbooker": {
      "id": "clxabc123def",
      "name": "Ali Ahmed",
      "phone": "03001234567"
    }
  },
  "transactions": [
    {
      "id": "clxtxn001",
      "shopId": "clxshop001",
      "type": "credit",
      "status": "approved",
      "amount": 15000,
      "previousBalance": 10000,
      "newBalance": 25000,
      "description": "Monthly order",
      "createdBy": "admin_user_id",
      "createdAt": "2025-01-10T09:00:00.000Z",
      "creator": {
        "id": "admin_user_id",
        "name": "Admin User",
        "role": "admin"
      }
    },
    {
      "id": "clxtxn002",
      "shopId": "clxshop001",
      "type": "recovery",
      "status": "approved",
      "amount": 5000,
      "previousBalance": 25000,
      "newBalance": 20000,
      "description": "Cash received",
      "createdBy": "clxabc123def",
      "createdAt": "2025-01-15T14:30:00.000Z",
      "creator": {
        "id": "clxabc123def",
        "name": "Ali Ahmed",
        "role": "orderbooker"
      }
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

**Error Responses:**
- `400` — `{ "error": "Shop ID is required" }`
- `404` — `{ "error": "Shop not found" }`

**Flutter Usage:**
```
// Get full ledger for selected shop:
GET /api/reports/ledger?shopId={shopId}

// Display:
// - Shop info (name, owner, area, phone, address)
// - Summary cards: totalCredit, totalRecovery, currentBalance
// - Transaction list (newest first — reverse the array)
// - Color code: type="credit" → amber, type="recovery" → green
```

---

### 8. Get Recovery Summary (Today's Report)

```
GET /api/reports/recovery-summary?date=2025-01-15
```

**Query Parameters:**
| Parameter | Example | Description |
|-----------|---------|-------------|
| `date` | `2025-01-15` | Optional — defaults to today |

**Success Response (200):**
```json
{
  "date": "2025-01-15",
  "grandTotalRecovery": 35000,
  "orderbookers": [
    {
      "orderbookerId": "clxabc123def",
      "orderbookerName": "Ali Ahmed",
      "orderbookerPhone": "03001234567",
      "totalRecovery": 35000,
      "totalShops": 8,
      "visitedShops": 5,
      "shops": [
        {
          "shopId": "clxshop001",
          "shopName": "Al-Madina General Store",
          "shopArea": "Gulshan-e-Iqbal",
          "previousBalance": 25000,
          "todayCredit": 0,
          "todayRecovery": 5000,
          "closingBalance": 20000,
          "visited": true,
          "recoveryEntries": [
            {
              "id": "clxtxn001",
              "amount": 5000,
              "time": "2025-01-15T14:30:00.000Z",
              "description": "Cash received",
              "hasGps": true,
              "gpsLat": 24.8607,
              "gpsLng": 67.0011
            }
          ]
        }
      ]
    }
  ]
}
```

**Flutter Usage:**
```
// Today's recovery summary (for dashboard stats):
GET /api/reports/recovery-summary?date=2025-01-15

// Filter for current orderbooker:
// Find the entry where orderbookerId == my userId
// Show: totalRecovery, visitedShops/totalShops
```

---

### 9. Get Business Summary

```
GET /api/summary
```

**No parameters required.**

**Success Response (200):**
```json
{
  "totalUsers": 5,
  "totalShops": 45,
  "totalTransactions": 320,
  "totalCredit": 1500000,
  "totalRecovery": 1200000,
  "netBalance": 300000
}
```

**Flutter Usage:**
```
// Quick stats for profile/dashboard:
// netBalance = total outstanding balance across all shops
```

---

### 10. Mobile Sync (Offline Support)

#### Initial Data Sync (GET)
```
GET /api/mobile/sync?userId={userId}
```

**Response (200):**
```json
{
  "user": {
    "id": "clxabc123def",
    "username": "ali",
    "name": "Ali Ahmed",
    "role": "orderbooker",
    "phone": "03001234567",
    "status": "active"
  },
  "shops": [
    {
      "id": "clxshop001",
      "name": "Al-Madina General Store",
      "balance": 25000,
      "creditLimit": 50000,
      "orderbooker": { "id": "clxabc123def", "name": "Ali Ahmed" },
      ...all shop fields
    }
  ],
  "transactions": [
    ...last 200 transactions by this user
  ],
  "syncTime": "2025-01-15T14:30:00.000Z"
}
```

**Flutter Usage:**
```
// On first login, call this to download all data locally
// Save shops to local SQLite
// Save transactions to local SQLite
// Use syncTime to know when last synced
```

#### Batch Sync Offline Recoveries (POST)
```
POST /api/mobile/sync
```

**Request Body:**
```json
{
  "transactions": [
    {
      "id": "local_txn_001",
      "shopId": "clxshop001",
      "type": "recovery",
      "amount": 5000,
      "createdBy": "clxabc123def",
      "previousBalance": 25000,
      "description": "Cash received",
      "gpsLat": 24.8607,
      "gpsLng": 67.0011,
      "gpsAddress": "Gulshan-e-Iqbal",
      "createdAt": "2025-01-15T14:30:00.000Z"
    },
    {
      "id": "local_txn_002",
      "shopId": "clxshop002",
      "type": "recovery",
      "amount": 3000,
      "createdBy": "clxabc123def",
      "previousBalance": 75000,
      "description": "Cheque",
      "createdAt": "2025-01-15T15:00:00.000Z"
    }
  ]
}
```

**Success Response (200):**
```json
{
  "synced": 2,
  "failed": 0,
  "results": [
    { "success": true, "id": "local_txn_001" },
    { "success": true, "id": "local_txn_002" }
  ]
}
```

**Flutter Usage:**
```
// When back online after being offline:
// 1. Read queued recoveries from local SQLite
// 2. Send them in batch using POST /api/mobile/sync
// 3. Remove successfully synced items from local queue
// 4. Show user: "2 recoveries synced successfully"
```

---

### API Quick Reference Card

| # | Method | Endpoint | Used For |
|---|--------|----------|----------|
| 1 | POST | `/api/auth/login` | Login |
| 2 | GET | `/api/auth/validate` | Server health check |
| 3 | POST | `/api/auth/change-password` | Change password |
| 4 | GET | `/api/shops?orderbookerId={id}&routeDay={day}` | Today's route shops |
| 5 | GET | `/api/shops?orderbookerId={id}` | All my shops |
| 6 | POST | `/api/transactions` | Submit recovery |
| 7 | GET | `/api/transactions?createdBy={id}&type=recovery&date={date}` | My today's recoveries |
| 8 | GET | `/api/transactions?shopId={id}&type=recovery&limit=5` | Shop recent transactions |
| 9 | GET | `/api/reports/ledger?shopId={id}` | Full shop ledger |
| 10 | GET | `/api/reports/recovery-summary?date={date}` | Daily recovery report |
| 11 | GET | `/api/summary` | Business summary |
| 12 | GET | `/api/mobile/sync?userId={id}` | Initial data download |
| 13 | POST | `/api/mobile/sync` | Batch sync offline recoveries |

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
2. **NO API key, NO Bearer token, NO authentication header** required — all APIs are open, just call them directly
3. **Login response** returns user data with `id`, `name`, `role`, `token` — use `user.id` as `orderbookerId` in all shop/transaction APIs
4. **Shops are filtered by `orderbookerId`** — after login, use the user's ID to fetch their shops
5. **Route day filtering** — filter shops by today's day name (lowercase: "monday", "tuesday", etc.)
6. **Recovery goes to pending** — after submission, tell user it's pending admin approval
7. **Balance shown on shops is the CURRENT balance** (including pending recoveries)
8. Keep the UI **simple and fast** — order bookers use this in the field on mobile data
9. **GPS is optional** but add it — it helps admin verify recoveries
10. The app should feel like a **native Android app** — smooth, fast, no web views
11. **For offline:** Use local SQLite to cache shops and queue recoveries. When online again, sync via `POST /api/mobile/sync`

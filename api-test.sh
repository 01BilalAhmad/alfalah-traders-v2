#!/bin/bash
BASE="http://localhost:3000"
TODAY=$(date +%Y-%m-%d)

echo "=== LOGIN TESTS ==="
echo -n "Admin login: "
curl -s -m 5 -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"AL-FALAH TRADER","password":"admin123"}'
echo ""

echo -n "Bad login: "
curl -s -m 5 -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"AL-FALAH TRADER","password":"wrong"}'
echo ""

echo -n "OB login: "
curl -s -m 5 -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"ahmed","password":"ob123"}'
echo ""

echo ""
echo "=== DATA TESTS ==="
echo -n "Orderbookers: "
curl -s -m 5 "$BASE/api/orderbookers" | wc -c
echo ""

echo -n "Shops(monday): "
curl -s -m 5 "$BASE/api/shops?routeDay=monday" | wc -c
echo ""

echo -n "Shops(search): "
curl -s -m 5 "$BASE/api/shops?search=al-madina" | wc -c
echo ""

echo -n "Recovery Summary: "
curl -s -m 5 "$BASE/api/reports/recovery-summary?date=$TODAY" | wc -c
echo ""

echo -n "Reconciliation: "
curl -s -m 5 "$BASE/api/reports/reconciliation?date=$TODAY" | wc -c
echo ""

echo -n "Audit Log: "
curl -s -m 5 "$BASE/api/audit" | wc -c
echo ""

echo -n "Transactions: "
curl -s -m 5 "$BASE/api/transactions?limit=5" | wc -c
echo ""

echo -n "Main page: "
curl -s -m 5 "$BASE/" | wc -c
echo ""

echo "DONE"

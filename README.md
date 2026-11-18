**English** · [Türkçe](README.tr.md)

# Apartmanım — apartment management system

A management panel that runs on your own computer for tracking dues, the building's cash box, announcements and maintenance requests.
All data lives in its own **SQLite database** (`veri/apartman.db`), so every time you open it you continue where you left off.

## Running it
- **Double-click:** `Apartmanım.command` → the server starts and the browser opens (http://127.0.0.1:8771).
- Or from the terminal: `python3 sunucu.py`
- To stop: close the Terminal window that opened (or press Ctrl+C).

Nothing else to install; only Python 3 (pre-installed on macOS).

## Features
- **Overview:** cash balance, this month's collection rate, overdue receivables, open maintenance requests, monthly income/expense chart, expense breakdown.
- **Flats:** block/number/floor, owner, tenant, phone, m², number of residents, flat-specific dues; bulk flat creation; printable flat account statement.
- **Dues:** 12-month table (paid / partial / unpaid), one-click payment, bulk dues charging (per flat, fixed, by m² or per person; multiple months at once), extra assessments (equal, split a total equally, split by m²). Payments are applied to the oldest debt first.
- **Cash box:** income and expense records, category/month filter, CSV export.
- **Announcements:** pinning, sharing on WhatsApp, copying.
- **Maintenance / Requests:** priority, status, cost; post the cost to the cash box as an expense with one click.
- **Reports:** flats in debt (with a WhatsApp reminder link), yearly income/expense report, printing.
- **Settings:** building info, IBAN, default dues, payment due day, opening cash balance, light/dark theme; download/restore backup; sample data; delete everything.

## Database
- File: `veri/apartman.db` (not committed to git).
- Tables: `daireler` (flats), `hareketler` (charges / payments / expenses / income), `duyurular` (announcements), `arizalar` (maintenance), `ayarlar` (settings).
- Deleting a flat also deletes its charges and payments (`ON DELETE CASCADE`); its maintenance requests move to "common area".
- **Automatic backup:** each time the server starts it saves a copy of the day as `veri/yedekler/apartman-YYYY-MM-DD.db` and keeps the last 14 days.
- The server is reachable only from this computer (127.0.0.1); the database file is never served to the browser.

## Files
- `sunucu.py` — HTTP server + JSON API + SQLite schema
- `index.html`, `style.css`
- `js/veri.js` — API client and calculations (balance, splitting, cash box)
- `js/arayuz.js` — form dialog, notifications, CSV
- `js/sayfalar.js` — pages
- `js/uygulama.js` — startup and routing

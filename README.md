# NAS100 Smart Money Auto-Trading

Clean Architecture (Hexagonal) scaffold for a NAS100 Smart Money bot and Next.js dashboard.

## Backend

- Domain entities: candlestick, trade, position
- Risk engine: fixed lot model `0.01 per $100`, `1% max SL`, `1 trade/day`
- Agent FSM: Asian consolidation -> London induction -> NY reversal

### Tradovate setup

Set these environment variables to execute against Tradovate (otherwise bot defaults to paper broker):

- `TRADOVATE_BASE_URL` (default: `https://demo-api.tradovate.com/v1`)
- `TRADOVATE_USERNAME`
- `TRADOVATE_PASSWORD`
- `TRADOVATE_APP_ID`
- `TRADOVATE_APP_VERSION`
- `TRADOVATE_CID` (optional)
- `TRADOVATE_SEC` (optional)
- `TRADOVATE_ACCOUNT_SPEC` (optional)

## Frontend

- Next.js + Tailwind dark-mode dashboard
- Trading panel with phase, symbol status, risk, and trade history

## Run

Backend:

```bash
cd backend
python -m pip install -e .
python -m smart_money_bot.main
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

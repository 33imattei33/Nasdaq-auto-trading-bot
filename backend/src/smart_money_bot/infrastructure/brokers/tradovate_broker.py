"""
╔══════════════════════════════════════════════════════════════════════╗
║      TRADOVATE BROKER — FULL PRODUCTION ADAPTER                      ║
║                                                                      ║
║   Connects directly to https://trader.tradovate.com/                 ║
║                                                                      ║
║   Features:                                                          ║
║   • REST auth with auto-renewal                                      ║
║   • Account data, positions, cash balance                            ║
║   • Market orders + bracket orders (entry + SL + TP)                 ║
║   • WebSocket real-time market data (quotes + charts)                ║
║   • WebSocket real-time user sync (positions, orders, fills)         ║
║   • Front-month NQ contract auto-discovery                           ║
║                                                                      ║
║   Base URLs:                                                         ║
║     Demo REST:  https://demo.tradovateapi.com/v1                     ║
║     Live REST:  https://live.tradovateapi.com/v1                     ║
║     Demo WS:    wss://demo.tradovateapi.com/v1/websocket             ║
║     Live WS:    wss://live.tradovateapi.com/v1/websocket             ║
║     MD WS:      wss://md.tradovateapi.com/v1/websocket               ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import platform
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

import httpx
import websockets
import websockets.asyncio.client

from smart_money_bot.application.ports.broker_port import BrokerPort
from smart_money_bot.domain.entities.trade import Trade
from smart_money_bot.models.schemas import (
    AccountState,
    CandleData,
)

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class TradovateConfig:
    username: str
    password: str
    app_id: str = "smart-money-bot"
    app_version: str = "1.0"
    cid: int | None = None
    sec: str | None = None
    device_id: str | None = None
    account_spec: str | None = None
    live: bool = False

    @property
    def rest_url(self) -> str:
        return (
            "https://live.tradovateapi.com/v1"
            if self.live
            else "https://demo.tradovateapi.com/v1"
        )

    @property
    def ws_url(self) -> str:
        return (
            "wss://live.tradovateapi.com/v1/websocket"
            if self.live
            else "wss://demo.tradovateapi.com/v1/websocket"
        )

    @property
    def md_ws_url(self) -> str:
        return "wss://md.tradovateapi.com/v1/websocket"

    def get_device_id(self) -> str:
        if self.device_id:
            return self.device_id
        raw = f"{platform.system()}-{platform.machine()}-{self.username}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    @staticmethod
    def from_env() -> TradovateConfig:
        cid_raw = os.getenv("TRADOVATE_CID")
        return TradovateConfig(
            username=os.getenv("TRADOVATE_USERNAME", ""),
            password=os.getenv("TRADOVATE_PASSWORD", ""),
            app_id=os.getenv("TRADOVATE_APP_ID", "smart-money-bot"),
            app_version=os.getenv("TRADOVATE_APP_VERSION", "1.0"),
            cid=int(cid_raw) if cid_raw else None,
            sec=os.getenv("TRADOVATE_SEC"),
            device_id=os.getenv("TRADOVATE_DEVICE_ID"),
            account_spec=os.getenv("TRADOVATE_ACCOUNT_SPEC"),
            live=os.getenv("TRADOVATE_LIVE", "").lower() in ("1", "true", "yes"),
        )


# ═══════════════════════════════════════════════════════════════════════
#  TRADOVATE BROKER — FULL ADAPTER
# ═══════════════════════════════════════════════════════════════════════

class TradovateBroker(BrokerPort):
    """
    Production-grade Tradovate adapter.

    Synchronous BrokerPort for the orchestrator (authenticate + place_trade),
    plus async methods for the FastAPI server (get_account, get_positions,
    get_orders, stream market data, etc.).
    """

    def __init__(self, config: TradovateConfig) -> None:
        self.config = config
        self._http: httpx.AsyncClient | None = None

        # Auth tokens
        self._access_token: str | None = None
        self._md_access_token: str | None = None
        self._token_expiry: datetime | None = None
        self._user_id: int | None = None

        # Account cache
        self._account_id: int | None = None
        self._account_spec: str | None = None
        self._accounts: list[dict] = []
        self._positions: list[dict] = []
        self._cash_balances: list[dict] = []
        self._orders: list[dict] = []
        self._fills: list[dict] = []

        # Contract cache
        self._contract_cache: dict[str, dict] = {}
        self._front_month_nq: str | None = None
        self._front_month_contract_id: int | None = None

        # Market data
        self._last_quote: dict[str, Any] = {}
        self._candle_buffer: list[CandleData] = []
        self._candle_map: dict[int, CandleData] = {}  # epoch_sec → CandleData

        # Chart timeframe settings
        self._chart_element_size: int = 1
        self._chart_underlying_type: str = "MinuteBar"

        # WebSocket handles
        self._rt_ws: Any = None
        self._md_ws: Any = None
        self._ws_request_id: int = 0
        self._ws_tasks: list[asyncio.Task] = []

        # Callbacks
        self._on_quote: Callable[[dict], None] | None = None
        self._on_position_update: Callable[[dict], None] | None = None
        self._on_fill: Callable[[dict], None] | None = None

    # ═══════════════════════════════════════════════════════════════════
    #  AUTHENTICATION
    # ═══════════════════════════════════════════════════════════════════

    def authenticate(self) -> None:
        """Synchronous auth — called at startup by server.py.

        Handles the Tradovate p-ticket challenge flow:
        1. First request may return p-ticket + p-time (+ optionally p-captcha).
        2. If p-captcha is False → wait p-time seconds → retry with p-ticket.
        3. If p-captcha is True → need API keys (cid/sec) to bypass,
           or user must solve captcha on trader.tradovate.com first.
        """
        import time as _time

        payload: dict[str, Any] = {
            "name": self.config.username,
            "password": self.config.password,
            "appId": self.config.app_id,
            "appVersion": self.config.app_version,
            "deviceId": self.config.get_device_id(),
        }
        if self.config.cid is not None:
            payload["cid"] = self.config.cid
        if self.config.sec:
            payload["sec"] = self.config.sec

        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{self.config.rest_url}/auth/accesstokenrequest", json=payload
            )
            # Don't raise_for_status here — Tradovate sends p-ticket as 401
            if resp.status_code not in (200, 401):
                resp.raise_for_status()
            body = resp.json()

        if "errorText" in body:
            raise RuntimeError(f"Tradovate auth failed: {body['errorText']}")

        # ── Handle p-ticket challenge ──
        if "p-ticket" in body and "accessToken" not in body:
            p_ticket = body["p-ticket"]
            p_time = body.get("p-time", 5)
            p_captcha = body.get("p-captcha", False)

            if p_captcha:
                log.warning(
                    "Tradovate requires CAPTCHA. To bypass: "
                    "1) Register an API app at https://trader.tradovate.com/#/security "
                    "   and set TRADOVATE_CID + TRADOVATE_SECRET env vars. "
                    "2) Or log into trader.tradovate.com in a browser first to "
                    "   clear the security flag, then restart."
                )
                log.info(
                    f"Attempting p-ticket retry anyway (wait {p_time}s)..."
                )

            log.info(f"Tradovate p-ticket challenge — waiting {p_time}s...")
            _time.sleep(p_time)

            payload["p-ticket"] = p_ticket
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    f"{self.config.rest_url}/auth/accesstokenrequest",
                    json=payload,
                )
                if resp.status_code not in (200, 401):
                    resp.raise_for_status()
                try:
                    body = resp.json()
                except Exception:
                    raise RuntimeError(
                        f"Tradovate p-ticket retry returned {resp.status_code} "
                        f"with no JSON body. CAPTCHA verification is required. "
                        f"Please log into https://trader.tradovate.com/ in your "
                        f"browser first, or set TRADOVATE_CID + TRADOVATE_SECRET "
                        f"in .env to bypass CAPTCHA."
                    )

            if "errorText" in body:
                raise RuntimeError(
                    f"Tradovate p-ticket auth failed: {body['errorText']}"
                )

        token = body.get("accessToken")
        if not token:
            raise RuntimeError(
                f"Tradovate auth: no accessToken in response: {body}"
            )

        self._access_token = token
        self._md_access_token = body.get("mdAccessToken")
        self._user_id = body.get("userId")
        self._token_expiry = datetime.fromisoformat(
            body.get("expirationTime", "2099-01-01T00:00:00Z").replace(
                "Z", "+00:00"
            )
        )

        log.info(
            f"✓ Tradovate authenticated as {self.config.username} "
            f"(userId={self._user_id})"
        )

        # Fetch accounts synchronously
        self._sync_fetch_accounts()

    def authenticate_with_token(
        self,
        access_token: str,
        md_access_token: str | None = None,
    ) -> None:
        """Skip password auth entirely — use a token grabbed from the browser.

        How to get the token:
        1. Log into https://trader.tradovate.com/
        2. Open DevTools (F12) → Application → Local Storage
        3. Find the key that contains your access token (usually under
           'tradovate-api-access-token' or inside a JSON blob)
        4. Copy the token string and paste it here.
        """
        self._access_token = access_token.strip()
        self._md_access_token = (
            md_access_token.strip() if md_access_token else access_token.strip()
        )
        # Give a generous expiry since we can't know the real one
        self._token_expiry = datetime(
            2099, 1, 1, tzinfo=timezone.utc
        )

        log.info("Authenticating with provided token…")

        # Verify token works by fetching accounts
        self._sync_fetch_accounts()

        if not self._account_id:
            raise RuntimeError(
                "Token appears invalid — could not fetch any accounts. "
                "Make sure you copied the full token from Local Storage."
            )

        log.info(
            f"✓ Token auth OK — {self._account_spec} "
            f"(id={self._account_id})"
        )

    def _sync_fetch_accounts(self) -> None:
        """Fetch account list right after auth to get accountId/accountSpec."""
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{self.config.rest_url}/account/list",
                headers=self._auth_headers(),
            )
            resp.raise_for_status()
            accounts = resp.json()

        self._accounts = accounts
        if accounts:
            if self.config.account_spec:
                match = [
                    a
                    for a in accounts
                    if a.get("name") == self.config.account_spec
                ]
                acct = match[0] if match else accounts[0]
            else:
                acct = accounts[0]

            self._account_id = acct.get("id")
            self._account_spec = acct.get("name")
            log.info(
                f"  Account: {self._account_spec} (id={self._account_id})"
            )

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._access_token}"}

    @property
    def is_authenticated(self) -> bool:
        if not self._access_token:
            return False
        if self._token_expiry and datetime.now(timezone.utc) >= self._token_expiry:
            return False
        return True

    async def ensure_authenticated(self) -> None:
        """Async token check + renewal."""
        if self.is_authenticated:
            return
        log.info("Token expired — renewing…")
        await self._async_authenticate()

    async def _async_authenticate(self) -> None:
        """Async re-authentication (handles p-ticket challenge)."""
        payload: dict[str, Any] = {
            "name": self.config.username,
            "password": self.config.password,
            "appId": self.config.app_id,
            "appVersion": self.config.app_version,
            "deviceId": self.config.get_device_id(),
        }
        if self.config.cid is not None:
            payload["cid"] = self.config.cid
        if self.config.sec:
            payload["sec"] = self.config.sec

        http = await self._get_http()
        resp = await http.post("/auth/accesstokenrequest", json=payload)
        if resp.status_code not in (200, 401):
            resp.raise_for_status()
        body = resp.json()

        if "errorText" in body:
            raise RuntimeError(f"Tradovate re-auth failed: {body['errorText']}")

        # Handle p-ticket
        if "p-ticket" in body and "accessToken" not in body:
            p_ticket = body["p-ticket"]
            p_time = body.get("p-time", 5)
            log.info(f"Async p-ticket challenge — waiting {p_time}s...")
            await asyncio.sleep(p_time)
            payload["p-ticket"] = p_ticket
            resp = await http.post("/auth/accesstokenrequest", json=payload)
            if resp.status_code not in (200, 401):
                resp.raise_for_status()
            body = resp.json()

        self._access_token = body["accessToken"]
        self._md_access_token = body.get("mdAccessToken")
        self._token_expiry = datetime.fromisoformat(
            body.get("expirationTime", "2099-01-01T00:00:00Z").replace(
                "Z", "+00:00"
            )
        )

    async def _get_http(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self.config.rest_url,
                headers=self._auth_headers(),
                timeout=20,
            )
        return self._http

    # ═══════════════════════════════════════════════════════════════════
    #  ACCOUNT DATA
    # ═══════════════════════════════════════════════════════════════════

    async def get_accounts(self) -> list[dict]:
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.get("/account/list", headers=self._auth_headers())
        resp.raise_for_status()
        self._accounts = resp.json()
        return self._accounts

    async def get_cash_balance(self) -> list[dict]:
        await self.ensure_authenticated()
        http = await self._get_http()
        if self._account_id:
            resp = await http.get(
                f"/cashBalance/deps?masterid={self._account_id}",
                headers=self._auth_headers(),
            )
        else:
            resp = await http.get(
                "/cashBalance/list", headers=self._auth_headers()
            )
        resp.raise_for_status()
        self._cash_balances = resp.json()
        return self._cash_balances

    async def get_positions(self) -> list[dict]:
        await self.ensure_authenticated()
        http = await self._get_http()
        if self._account_id:
            resp = await http.get(
                f"/position/deps?masterid={self._account_id}",
                headers=self._auth_headers(),
            )
        else:
            resp = await http.get(
                "/position/list", headers=self._auth_headers()
            )
        resp.raise_for_status()
        self._positions = resp.json()
        return self._positions

    async def get_orders(self) -> list[dict]:
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.get("/order/list", headers=self._auth_headers())
        resp.raise_for_status()
        self._orders = resp.json()
        return self._orders

    async def get_fills(self) -> list[dict]:
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.get("/fill/list", headers=self._auth_headers())
        resp.raise_for_status()
        self._fills = resp.json()
        return self._fills

    async def get_account_state(self) -> AccountState:
        """Build AccountState from live Tradovate data."""
        await self.get_cash_balance()
        await self.get_positions()

        balance = 0.0
        for cb in self._cash_balances:
            balance += cb.get("amount", 0.0) or 0.0

        unrealized = 0.0
        for pos in self._positions:
            unrealized += pos.get("unrealizedPnL", 0.0) or 0.0

        equity = balance + unrealized

        return AccountState(
            balance=round(balance, 2),
            equity=round(equity, 2),
            free_margin=round(equity, 2),
            leverage=1,
            open_positions=len(
                [p for p in self._positions if (p.get("netPos", 0) or 0) != 0]
            ),
            daily_pnl=round(unrealized, 2),
        )

    # ═══════════════════════════════════════════════════════════════════
    #  CONTRACT DISCOVERY
    # ═══════════════════════════════════════════════════════════════════

    async def find_contract(self, name: str) -> dict | None:
        """Find a contract by name (e.g., 'NQH6', 'MNQH6')."""
        if name in self._contract_cache:
            return self._contract_cache[name]
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.get(
            f"/contract/find?name={name}", headers=self._auth_headers()
        )
        if resp.status_code == 200:
            data = resp.json()
            if data:
                self._contract_cache[name] = data
                return data
        return None

    async def suggest_contracts(self, text: str, limit: int = 5) -> list[dict]:
        """Suggest contracts matching text (e.g., 'NQ')."""
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.get(
            f"/contract/suggest?t={text}&l={limit}",
            headers=self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def get_front_month_nq(self, micro: bool = True) -> str:
        """Auto-discover the front-month NQ or MNQ contract."""
        if self._front_month_nq:
            return self._front_month_nq

        product = "MNQ" if micro else "NQ"
        try:
            suggestions = await self.suggest_contracts(product, limit=5)
            if suggestions:
                contract = suggestions[0]
                name = contract.get("name", "")
                self._front_month_nq = name
                self._front_month_contract_id = contract.get("id")
                self._contract_cache[name] = contract
                log.info(
                    f"  Front-month contract: {name} "
                    f"(id={self._front_month_contract_id})"
                )
                return name
        except Exception as e:
            log.warning(f"  Contract suggest failed: {e}")

        # Fallback: compute based on current date
        now = datetime.now(timezone.utc)
        month_codes = {3: "H", 6: "M", 9: "U", 12: "Z"}
        year_digit = now.year % 10
        for m in sorted(month_codes.keys()):
            if now.month <= m:
                name = f"{product}{month_codes[m]}{year_digit}"
                self._front_month_nq = name
                return name
        name = f"{product}H{(now.year + 1) % 10}"
        self._front_month_nq = name
        return name

    # ═══════════════════════════════════════════════════════════════════
    #  HISTORICAL CANDLES (REST FALLBACK)
    # ═══════════════════════════════════════════════════════════════════

    async def fetch_candles_rest(
        self, symbol: str | None = None, count: int = 500
    ) -> list[CandleData]:
        """Fetch historical 1-min bars via Tradovate MD REST API.

        This is the fallback when WebSocket chart data isn't arriving.
        Uses the /md/getChart endpoint which works on both demo and live.
        """
        sym = symbol or self._front_month_nq
        if not sym:
            return []

        # Determine the chart symbol (continuous contract)
        if sym.startswith("MNQ"):
            chart_symbol = sym  # Use the specific contract
        elif sym.startswith("NQ"):
            chart_symbol = sym
        else:
            chart_symbol = sym

        http = await self._get_http()
        try:
            # Try the replay/chart endpoint first (works for historical data)
            # Tradovate doesn't have a direct REST chart endpoint,
            # but we can get OHLCV from the md WebSocket getChart.

            # Alternative: use Tradovate's tick chart via the contract ID
            contract_id = self._front_month_contract_id
            if not contract_id:
                # Look up the contract
                contract = await self.find_contract(sym)
                if contract:
                    contract_id = contract.get("id")

            if not contract_id:
                log.warning("No contract ID for chart data")
                return []

            # Use md/getChart via the market data WebSocket if available
            if self._md_ws:
                try:
                    rid = self._next_ws_id()
                    chart_req = {
                        "symbol": chart_symbol,
                        "chartDescription": {
                            "underlyingType": self._chart_underlying_type,
                            "elementSize": self._chart_element_size,
                            "elementSizeUnit": "UnderlyingUnits",
                            "withHistogram": False,
                        },
                        "timeRange": {"asMuchAsElements": count},
                    }
                    await self._md_ws.send(
                        f"md/getChart\n{rid}\n\n{json.dumps(chart_req)}"
                    )
                    log.info(f"  Sent chart request for {chart_symbol} ({count} bars)")
                    # The response will be processed by _process_md_message
                    # Wait a few seconds for data to arrive
                    await asyncio.sleep(3)
                    return self._candle_buffer[-count:]
                except Exception as e:
                    log.warning(f"  WS chart request failed: {e}")

            return []
        except Exception as e:
            log.error(f"  fetch_candles_rest error: {e}")
            return []

    # ═══════════════════════════════════════════════════════════════════
    #  ORDER PLACEMENT
    # ═══════════════════════════════════════════════════════════════════

    def place_trade(self, trade: Trade) -> str:
        """Synchronous order placement — for orchestrator compatibility."""
        if not self._access_token:
            raise RuntimeError("Not authenticated")

        symbol = self._front_month_nq or trade.symbol
        action = "Buy" if trade.side.value == "buy" else "Sell"

        payload: dict[str, Any] = {
            "accountSpec": self._account_spec,
            "accountId": self._account_id,
            "action": action,
            "symbol": symbol,
            "orderQty": max(1, int(trade.lot_size)),
            "orderType": "Market",
            "isAutomated": True,
            "text": trade.trade_id,
        }

        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{self.config.rest_url}/order/placeOrder",
                headers=self._auth_headers(),
                json=payload,
            )
            resp.raise_for_status()
            body = resp.json()

        order_id = body.get("orderId") or body.get("id") or trade.trade_id
        log.info(
            f"  Order placed: {action} {symbol} "
            f"qty={payload['orderQty']} → orderId={order_id}"
        )
        return str(order_id)

    async def place_market_order(
        self,
        symbol: str,
        action: str,
        qty: int = 1,
        text: str = "",
    ) -> dict:
        """Async market order."""
        await self.ensure_authenticated()
        http = await self._get_http()
        payload = {
            "accountSpec": self._account_spec,
            "accountId": self._account_id,
            "action": action,
            "symbol": symbol,
            "orderQty": qty,
            "orderType": "Market",
            "isAutomated": True,
            "text": text or f"SMB-{uuid.uuid4().hex[:8]}",
        }
        resp = await http.post(
            "/order/placeOrder", json=payload, headers=self._auth_headers()
        )
        resp.raise_for_status()
        result = resp.json()
        log.info(f"  Market order: {action} {symbol} x{qty} → {result}")
        return result

    async def place_bracket_order(
        self,
        symbol: str,
        action: str,
        qty: int = 1,
        profit_target_ticks: int = 80,
        stop_loss_ticks: int = 20,
        trailing_stop: bool = False,
    ) -> dict:
        """
        Place a bracket order (entry + SL + TP) via orderStrategy.

        For NQ/MNQ: 1 tick = 0.25 points.
        profit_target_ticks: positive (distance in ticks from entry to TP)
        stop_loss_ticks: positive (distance in ticks from entry to SL)
        """
        await self.ensure_authenticated()
        http = await self._get_http()

        params = json.dumps(
            {
                "entryVersion": {
                    "orderQty": qty,
                    "orderType": "Market",
                    "timeInForce": "Day",
                },
                "brackets": [
                    {
                        "qty": qty,
                        "profitTarget": abs(profit_target_ticks),
                        "stopLoss": -abs(stop_loss_ticks),
                        "trailingStop": trailing_stop,
                    }
                ],
            }
        )

        payload = {
            "accountId": self._account_id,
            "accountSpec": self._account_spec,
            "symbol": symbol,
            "action": action,
            "orderStrategyTypeId": 2,
            "params": params,
        }

        resp = await http.post(
            "/orderStrategy/startOrderStrategy",
            json=payload,
            headers=self._auth_headers(),
        )
        resp.raise_for_status()
        result = resp.json()
        log.info(
            f"  Bracket order: {action} {symbol} x{qty} "
            f"TP={profit_target_ticks} SL={stop_loss_ticks} → {result}"
        )
        return result

    async def place_oco_order(
        self,
        symbol: str,
        qty: int,
        take_profit_price: float,
        stop_loss_price: float,
    ) -> dict:
        """Place OCO order for TP + SL."""
        await self.ensure_authenticated()
        http = await self._get_http()

        payload = {
            "accountSpec": self._account_spec,
            "accountId": self._account_id,
            "action": "Sell",
            "symbol": symbol,
            "orderQty": qty,
            "orderType": "Limit",
            "price": take_profit_price,
            "isAutomated": True,
            "other": {
                "action": "Sell",
                "symbol": symbol,
                "orderQty": qty,
                "orderType": "Stop",
                "stopPrice": stop_loss_price,
                "isAutomated": True,
            },
        }

        resp = await http.post(
            "/order/placeOCO", json=payload, headers=self._auth_headers()
        )
        resp.raise_for_status()
        return resp.json()

    async def cancel_order(self, order_id: int) -> dict:
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.post(
            "/order/cancelorder",
            json={"orderId": order_id, "isAutomated": True},
            headers=self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def liquidate_position(self, contract_id: int) -> dict:
        await self.ensure_authenticated()
        http = await self._get_http()
        resp = await http.post(
            "/order/liquidateposition",
            json={
                "accountId": self._account_id,
                "contractId": contract_id,
                "admin": False,
            },
            headers=self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    # ═══════════════════════════════════════════════════════════════════
    #  WEBSOCKET — REAL-TIME USER DATA
    # ═══════════════════════════════════════════════════════════════════

    def _next_ws_id(self) -> int:
        self._ws_request_id += 1
        return self._ws_request_id

    async def start_realtime_sync(self) -> None:
        """Connect to Tradovate real-time WS and sync positions/orders/fills."""
        if not self._access_token or not self._user_id:
            log.warning("Cannot start RT sync: not authenticated")
            return

        task = asyncio.create_task(self._rt_sync_loop())
        self._ws_tasks.append(task)

    async def _rt_sync_loop(self) -> None:
        """Real-time WebSocket loop with auto-reconnect."""
        while True:
            try:
                async with websockets.asyncio.client.connect(
                    self.config.ws_url
                ) as ws:
                    self._rt_ws = ws
                    log.info("  RT WebSocket connected")

                    msg = await ws.recv()
                    if msg != "o":
                        log.warning(f"  Unexpected WS open frame: {msg}")

                    rid = self._next_ws_id()
                    await ws.send(
                        f"authorize\n{rid}\n\n{self._access_token}"
                    )
                    auth_resp = await ws.recv()
                    log.info(f"  RT auth response: {str(auth_resp)[:100]}")

                    rid = self._next_ws_id()
                    await ws.send(
                        f"user/syncrequest\n{rid}\n\n"
                        f"{json.dumps({'users': [self._user_id]})}"
                    )

                    async def heartbeat():
                        while True:
                            await asyncio.sleep(2.5)
                            try:
                                await ws.send("[]")
                            except Exception:
                                return

                    hb_task = asyncio.create_task(heartbeat())
                    try:
                        async for raw in ws:
                            self._process_rt_message(str(raw))
                    finally:
                        hb_task.cancel()

            except asyncio.CancelledError:
                return
            except Exception as e:
                log.error(
                    f"  RT WebSocket error: {e} — reconnecting in 5s"
                )
                await asyncio.sleep(5)

    def _process_rt_message(self, raw: str) -> None:
        """Process a real-time WebSocket message."""
        if not raw or raw in ("h", "o", "c"):
            return
        if not raw.startswith("a"):
            return

        try:
            data_list = json.loads(raw[1:])
        except (json.JSONDecodeError, IndexError):
            return

        for item in data_list:
            if isinstance(item, dict):
                if "d" in item and isinstance(item["d"], dict):
                    d = item["d"]
                    if "positions" in d:
                        self._positions = d["positions"]
                    if "orders" in d:
                        self._orders = d["orders"]
                    if "fills" in d:
                        self._fills = d["fills"]
                    if "accounts" in d:
                        self._accounts = d["accounts"]
                    if "cashBalances" in d:
                        self._cash_balances = d["cashBalances"]

                if "e" in item and item["e"] == "props":
                    self._handle_props_event(item.get("d", {}))

    def _handle_props_event(self, data: dict) -> None:
        """Handle real-time property update events."""
        entity_type = data.get("entityType", "")
        entity = data.get("entity", {})
        event_type = data.get("eventType", "")

        if entity_type == "position":
            self._update_entity_list(
                self._positions, entity, event_type
            )
            if self._on_position_update:
                self._on_position_update(entity)

        elif entity_type == "order":
            self._update_entity_list(self._orders, entity, event_type)

        elif entity_type == "fill":
            self._update_entity_list(self._fills, entity, event_type)
            if self._on_fill:
                self._on_fill(entity)

        elif entity_type == "cashBalance":
            self._update_entity_list(
                self._cash_balances, entity, event_type
            )

    @staticmethod
    def _update_entity_list(
        lst: list[dict], entity: dict, event_type: str
    ) -> None:
        eid = entity.get("id")
        if event_type == "Deleted":
            lst[:] = [e for e in lst if e.get("id") != eid]
        else:
            for i, e in enumerate(lst):
                if e.get("id") == eid:
                    lst[i] = entity
                    return
            lst.append(entity)

    # ═══════════════════════════════════════════════════════════════════
    #  WEBSOCKET — MARKET DATA
    # ═══════════════════════════════════════════════════════════════════

    async def start_market_data(self, symbol: str | None = None) -> None:
        """Connect to market data WS and subscribe to quotes + charts."""
        # Fall back to access_token if md_access_token is empty/None
        if not self._md_access_token:
            if self._access_token:
                log.info("No mdAccessToken — using accessToken for MD stream")
                self._md_access_token = self._access_token
            else:
                log.warning("Cannot start MD: no token available")
                return

        sym = symbol or self._front_month_nq or "@NQ"
        task = asyncio.create_task(self._md_loop(sym))
        self._ws_tasks.append(task)

    async def _md_loop(self, symbol: str) -> None:
        """Market data WebSocket loop with auto-reconnect."""
        while True:
            try:
                async with websockets.asyncio.client.connect(
                    self.config.md_ws_url
                ) as ws:
                    self._md_ws = ws
                    log.info("  MD WebSocket connected")

                    msg = await ws.recv()
                    if msg != "o":
                        log.warning(f"  Unexpected MD open frame: {msg}")

                    rid = self._next_ws_id()
                    await ws.send(
                        f"authorize\n{rid}\n\n{self._md_access_token}"
                    )
                    auth_resp = await ws.recv()
                    log.info(f"  MD auth response: {str(auth_resp)[:100]}")

                    # Subscribe to quotes
                    rid = self._next_ws_id()
                    await ws.send(
                        f"md/subscribequote\n{rid}\n\n"
                        f"{json.dumps({'symbol': symbol})}"
                    )

                    # Subscribe to chart with current timeframe settings
                    chart_symbol = symbol
                    log.info(
                        f"  Subscribing chart for {chart_symbol} "
                        f"({self._chart_underlying_type} x{self._chart_element_size})"
                    )

                    rid = self._next_ws_id()
                    chart_req = {
                        "symbol": chart_symbol,
                        "chartDescription": {
                            "underlyingType": self._chart_underlying_type,
                            "elementSize": self._chart_element_size,
                            "elementSizeUnit": "UnderlyingUnits",
                            "withHistogram": False,
                        },
                        "timeRange": {"asMuchAsElements": 500},
                    }
                    await ws.send(
                        f"md/getChart\n{rid}\n\n{json.dumps(chart_req)}"
                    )

                    async def heartbeat():
                        while True:
                            await asyncio.sleep(2.5)
                            try:
                                await ws.send("[]")
                            except Exception:
                                return

                    hb_task = asyncio.create_task(heartbeat())
                    try:
                        async for raw in ws:
                            raw_str = str(raw)
                            # Log first few messages and any non-heartbeat messages
                            if len(self._candle_buffer) < 5 and raw_str not in ("h", "[]"):
                                log.info(f"  MD raw ({len(raw_str)} chars): {raw_str[:300]}")
                            self._process_md_message(raw_str)
                    finally:
                        hb_task.cancel()

            except asyncio.CancelledError:
                return
            except Exception as e:
                log.error(
                    f"  MD WebSocket error: {e} — reconnecting in 5s"
                )
                await asyncio.sleep(5)

    def _process_md_message(self, raw: str) -> None:
        """Process market data WebSocket message."""
        if not raw or raw in ("h", "o", "c"):
            return
        if raw == "[]":
            return
        if not raw.startswith("a"):
            # Some messages may be plain JSON
            if raw.startswith("{") or raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    items = parsed if isinstance(parsed, list) else [parsed]
                    for item in items:
                        if isinstance(item, dict):
                            self._extract_md_data(item)
                except Exception:
                    pass
            return

        try:
            data_list = json.loads(raw[1:])
        except (json.JSONDecodeError, IndexError):
            return

        if isinstance(data_list, list):
            for item in data_list:
                if isinstance(item, dict):
                    self._extract_md_data(item)
                elif isinstance(item, str):
                    # Try direct JSON parse first
                    parsed = None
                    try:
                        parsed = json.loads(item)
                    except (json.JSONDecodeError, ValueError):
                        pass

                    # If direct parse failed, try Tradovate protocol framing:
                    # "endpoint\nid\n\n{json_body}"
                    if parsed is None and "\n\n" in item:
                        json_part = item.split("\n\n", 1)[1]
                        try:
                            parsed = json.loads(json_part)
                        except (json.JSONDecodeError, ValueError):
                            pass

                    if isinstance(parsed, dict):
                        self._extract_md_data(parsed)
                    elif isinstance(parsed, list):
                        for sub in parsed:
                            if isinstance(sub, dict):
                                self._extract_md_data(sub)
        elif isinstance(data_list, dict):
            self._extract_md_data(data_list)

    # ── Candle upsert helper ──────────────────────────────────────

    def _upsert_candle(self, candle: CandleData) -> None:
        """Insert or update a candle bar keyed by its timestamp.

        Real-time chart updates from Tradovate repeatedly send the
        current bar with updated OHLCV.  Instead of appending every
        tick we upsert so the buffer always contains one entry per
        time-bucket.
        """
        epoch = int(candle.timestamp.timestamp())
        self._candle_map[epoch] = candle

        # Trim to newest 1000 bars when the map grows beyond 1050
        if len(self._candle_map) > 1050:
            sorted_keys = sorted(self._candle_map.keys())
            for k in sorted_keys[: len(sorted_keys) - 1000]:
                del self._candle_map[k]

        # Rebuild sorted list (cheap at ≤500 items)
        self._candle_buffer = [
            self._candle_map[k] for k in sorted(self._candle_map)
        ]

    def _parse_bar_timestamp(self, ts_raw: Any) -> datetime:
        """Parse a bar timestamp string into a tz-aware datetime."""
        if isinstance(ts_raw, str) and ts_raw:
            try:
                return datetime.fromisoformat(
                    ts_raw.replace("Z", "+00:00")
                )
            except ValueError:
                pass
        if isinstance(ts_raw, (int, float)) and ts_raw > 0:
            return datetime.fromtimestamp(ts_raw, tz=timezone.utc)
        return datetime.now(timezone.utc)

    def _bar_to_candle(self, bar: dict) -> CandleData:
        """Convert a raw Tradovate bar dict into a CandleData."""
        dt = self._parse_bar_timestamp(bar.get("timestamp", ""))
        return CandleData(
            timestamp=dt,
            open=bar.get("open", 0),
            high=bar.get("high", 0),
            low=bar.get("low", 0),
            close=bar.get("close", 0),
            volume=bar.get("upVolume", 0) + bar.get("downVolume", 0),
        )

    # ── MD message extraction ─────────────────────────────────────

    def _extract_md_data(self, item: dict) -> None:
        """Extract quote and chart data from a parsed MD message dict."""
        d = item.get("d", item)  # data may be at top level or nested under 'd'

        # Log keys for debugging (only when buffer is small)
        if len(self._candle_map) < 5:
            top_keys = list(item.keys())[:10]
            d_keys = list(d.keys())[:10] if isinstance(d, dict) else []
            log.info(f"  _extract_md_data: item_keys={top_keys}, d_keys={d_keys}")

        # Quote data
        if "entries" in d:
            entries = d["entries"]
            bid = entries.get("Bid", {})
            ask = entries.get("Offer", {})
            trade_entry = entries.get("Trade", {})

            self._last_quote = {
                "bid": bid.get("price", 0),
                "ask": ask.get("price", 0),
                "last": trade_entry.get("price", 0),
                "size": trade_entry.get("size", 0),
                "timestamp": d.get("timestamp", ""),
            }

            if self._on_quote:
                self._on_quote(self._last_quote)

        # ── Chart / candle data — try multiple locations ──────────
        bars = None
        if "bars" in d:
            bars = d["bars"]
        elif "bars" in item:
            bars = item["bars"]
        elif "charts" in d:
            charts = d["charts"]
            if isinstance(charts, list):
                for chart in charts:
                    if isinstance(chart, dict) and "bars" in chart:
                        bars = chart["bars"]
                        break
                    elif isinstance(chart, dict) and "bp" in chart:
                        bars = [chart]
                        break
        elif "charts" in item:
            charts = item["charts"]
            if isinstance(charts, list):
                for chart in charts:
                    if isinstance(chart, dict) and "bars" in chart:
                        bars = chart["bars"]
                        break

        if bars and isinstance(bars, list):
            prev = len(self._candle_map)
            for bar in bars:
                if isinstance(bar, dict):
                    self._upsert_candle(self._bar_to_candle(bar))
            added = len(self._candle_map) - prev
            if added > 0:
                log.info(
                    f"  Received {added} new candle bars "
                    f"(total unique: {len(self._candle_map)})"
                )

        # ── Real-time bar packs ("bp") ────────────────────────────
        bp = d.get("bp") or item.get("bp")
        if bp and isinstance(bp, list):
            for bar_pack in bp:
                if isinstance(bar_pack, dict):
                    self._upsert_candle(self._bar_to_candle(bar_pack))

    # ═══════════════════════════════════════════════════════════════════
    #  PUBLIC ACCESSORS
    # ═══════════════════════════════════════════════════════════════════

    async def change_chart_timeframe(
        self, element_size: int, underlying_type: str = "MinuteBar"
    ) -> bool:
        """Switch the chart subscription to a different timeframe.

        Clears existing candle data and sends a new md/getChart
        request over the existing MD WebSocket.

        Returns True on success.
        """
        self._chart_element_size = element_size
        self._chart_underlying_type = underlying_type

        # Clear existing candle data
        self._candle_map.clear()
        self._candle_buffer.clear()

        if not self._md_ws:
            log.warning("change_chart_timeframe: no MD WebSocket")
            return False

        symbol = self._front_month_nq
        if not symbol:
            log.warning("change_chart_timeframe: no symbol")
            return False

        try:
            rid = self._next_ws_id()
            chart_req = {
                "symbol": symbol,
                "chartDescription": {
                    "underlyingType": underlying_type,
                    "elementSize": element_size,
                    "elementSizeUnit": "UnderlyingUnits",
                    "withHistogram": False,
                },
                "timeRange": {"asMuchAsElements": 500},
            }
            await self._md_ws.send(
                f"md/getChart\n{rid}\n\n{json.dumps(chart_req)}"
            )
            log.info(
                f"  Chart timeframe changed → {underlying_type} x{element_size}"
            )
            return True
        except Exception as e:
            log.error(f"  change_chart_timeframe error: {e}")
            return False

    @property
    def last_price(self) -> float:
        return self._last_quote.get("last", 0.0) or 0.0

    @property
    def bid(self) -> float:
        return self._last_quote.get("bid", 0.0) or 0.0

    @property
    def ask(self) -> float:
        return self._last_quote.get("ask", 0.0) or 0.0

    @property
    def candles(self) -> list[CandleData]:
        return self._candle_buffer  # already sorted by _upsert_candle

    @property
    def cached_positions(self) -> list[dict]:
        return self._positions

    @property
    def cached_orders(self) -> list[dict]:
        return self._orders

    @property
    def cached_fills(self) -> list[dict]:
        return self._fills

    # ═══════════════════════════════════════════════════════════════════
    #  LIFECYCLE
    # ═══════════════════════════════════════════════════════════════════

    async def start_all_streams(self, symbol: str | None = None) -> None:
        """Start both RT sync and MD streams."""
        await self.start_realtime_sync()
        sym = symbol or await self.get_front_month_nq()
        await self.start_market_data(sym)
        log.info(f"  All streams started for {sym}")

    async def stop_all_streams(self) -> None:
        """Cancel all WS tasks."""
        for task in self._ws_tasks:
            task.cancel()
        self._ws_tasks.clear()

        if self._http and not self._http.is_closed:
            await self._http.aclose()

    async def close(self) -> None:
        await self.stop_all_streams()

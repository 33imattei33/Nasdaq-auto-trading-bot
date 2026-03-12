from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class TradeSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class TradeStatus(str, Enum):
    PENDING = "pending"
    OPEN = "open"
    CLOSED = "closed"
    REJECTED = "rejected"


@dataclass
class Trade:
    trade_id: str
    symbol: str
    side: TradeSide
    entry_price: float
    stop_loss: float
    lot_size: float
    opened_at: datetime
    take_profit: float | None = None
    status: TradeStatus = TradeStatus.PENDING
    closed_at: datetime | None = None
    pnl: float = 0.0
    metadata: dict[str, str] = field(default_factory=dict)

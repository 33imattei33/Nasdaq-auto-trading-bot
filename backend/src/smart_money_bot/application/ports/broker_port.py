from __future__ import annotations

from typing import Protocol

from smart_money_bot.domain.entities.trade import Trade


class BrokerPort(Protocol):
    def authenticate(self) -> None:
        ...

    def place_trade(self, trade: Trade) -> str:
        ...

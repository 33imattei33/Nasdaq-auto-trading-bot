from __future__ import annotations

from nq_trading_agents.application.ports.broker_port import BrokerPort
from nq_trading_agents.domain.entities.trade import Trade, TradeStatus


class PaperBroker(BrokerPort):
    def __init__(self) -> None:
        self.placed_trades: list[Trade] = []

    def authenticate(self) -> None:
        return None

    def place_trade(self, trade: Trade) -> str:
        trade.status = TradeStatus.OPEN
        self.placed_trades.append(trade)
        return trade.trade_id

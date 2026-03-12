from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from smart_money_bot.application.agents.smart_money_agent import SmartMoneyAgent
from smart_money_bot.domain.entities.position import Position
from smart_money_bot.domain.services.risk_manager import RiskManager
from smart_money_bot.infrastructure.brokers.paper_broker import PaperBroker
from smart_money_bot.infrastructure.brokers.tradovate_broker import (
    TradovateBroker,
    TradovateConfig,
)


def run_once(frame: pd.DataFrame) -> None:
    tradovate_ready = bool(
        TradovateConfig.from_env().username and TradovateConfig.from_env().password
    )
    broker = PaperBroker()
    if tradovate_ready:
        broker = TradovateBroker(TradovateConfig.from_env())
        broker.authenticate()

    agent = SmartMoneyAgent(
        symbol="NAS100",
        broker=broker,
        risk_manager=RiskManager(),
        position=Position(account_equity=10_000.0),
    )

    trade = agent.on_market_data(frame, now=datetime.now(timezone.utc))
    if trade:
        print(f"Trade opened: {trade.trade_id} {trade.side} @ {trade.entry_price}")
    else:
        print("No qualifying Smart Money setup found in this cycle.")


if __name__ == "__main__":
    demo = pd.DataFrame(
        [
            {
                "timestamp": datetime.now(timezone.utc),
                "open": 19300,
                "high": 19325,
                "low": 19280,
                "close": 19310,
                "volume": 1000,
            }
        ]
    )
    run_once(demo)

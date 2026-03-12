from __future__ import annotations

import pandas as pd

from smart_money_bot.application.ports.market_data_port import MarketDataPort


class PandasMarketData(MarketDataPort):
    def __init__(self, frame: pd.DataFrame) -> None:
        self._frame = frame

    def latest_frame(self, symbol: str, timeframe: str, limit: int = 300) -> pd.DataFrame:
        del symbol, timeframe
        return self._frame.tail(limit).copy()

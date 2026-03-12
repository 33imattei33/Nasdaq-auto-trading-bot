from __future__ import annotations

from typing import Protocol

import pandas as pd


class MarketDataPort(Protocol):
    def latest_frame(self, symbol: str, timeframe: str, limit: int = 300) -> pd.DataFrame:
        ...

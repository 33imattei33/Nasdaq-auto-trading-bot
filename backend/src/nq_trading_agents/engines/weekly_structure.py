"""
╔══════════════════════════════════════════════════════════════════════╗
║      WEEKLY STRUCTURE ENGINE                                         ║
║   5-Act institutional playbook mapped to day of week                 ║
╚══════════════════════════════════════════════════════════════════════╝

Act 1 — Connector (Sun/Mon): Market opens, sets initial bias.
Act 2 — Accumulation (Tue): Institutions build positions.
Act 3 — Reversal (Wed): KEY DAY — the move.
Act 4 — Distribution (Thu): Take profit, wind down.
Act 5 — Epilogue (Fri): Reduced risk, close before weekend.
"""
from __future__ import annotations

from datetime import datetime

from nq_trading_agents.config import CONFIG
from nq_trading_agents.models.schemas import WeeklyAct


class WeeklyStructureEngine:
    """Determines the current weekly act based on day of week."""

    def __init__(self) -> None:
        self._cfg = CONFIG.weekly

    def get_current_act(self, utc_now: datetime) -> WeeklyAct:
        weekday = utc_now.weekday()  # Mon=0 … Sun=6

        if weekday in self._cfg.connector_days:
            return WeeklyAct.CONNECTOR
        if weekday == self._cfg.accumulation_day:
            return WeeklyAct.ACCUMULATION
        if weekday == self._cfg.reversal_day:
            return WeeklyAct.REVERSAL
        if weekday == self._cfg.distribution_day:
            return WeeklyAct.DISTRIBUTION
        if weekday == self._cfg.epilogue_day:
            return WeeklyAct.EPILOGUE
        return WeeklyAct.CONNECTOR

    def is_high_probability_day(self, utc_now: datetime) -> bool:
        act = self.get_current_act(utc_now)
        return act in (WeeklyAct.ACCUMULATION, WeeklyAct.REVERSAL)

    def should_reduce_risk(self, utc_now: datetime) -> bool:
        """Reduce risk on Fridays, but allow trading during NY kill zone (14-16 UTC)."""
        if self.get_current_act(utc_now) != WeeklyAct.EPILOGUE:
            return False
        # Allow trading during NY kill zone on Fridays
        if 14 <= utc_now.hour < 16:
            return False
        return True

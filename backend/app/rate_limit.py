"""Per-user limits on the calls that spend Gemini quota.

Kept in memory: the app runs as one process (a single Railway service), so one counter
per user is exact. Limits reset when the process restarts, which is acceptable for
protecting a free-tier quota, not for billing.
"""

import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass, field

from app.errors import UserFacingError

HOUR_SECONDS = 3600


class TooManyRequests(UserFacingError):
    status_code = 429
    user_message = "You've done that too often. Try again in a little while."


@dataclass
class RateLimiter:
    max_calls: int
    window_seconds: float
    clock: Callable[[], float] = time.monotonic
    _calls: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))

    def check(self, key: str) -> None:
        """Records a call for `key`, or raises if the window is already full."""
        now = self.clock()
        calls = self._calls[key]
        while calls and now - calls[0] >= self.window_seconds:
            calls.popleft()
        if len(calls) >= self.max_calls:
            raise TooManyRequests()
        calls.append(now)
        self._forget_idle(now)

    def _forget_idle(self, now: float) -> None:
        # Keys whose calls have all expired are dropped, so many one-off callers (or spoofed
        # addresses) cannot grow the table without bound.
        idle = [key for key, calls in self._calls.items() if not calls or now - calls[-1] >= self.window_seconds]
        for key in idle:
            del self._calls[key]


# Generous for real use, tight enough that one account cannot drain the shared quota.
APPLY_LIMIT = RateLimiter(max_calls=10, window_seconds=HOUR_SECONDS)
GEMINI_HR_LIMIT = RateLimiter(max_calls=60, window_seconds=HOUR_SECONDS)
# Per client address. A classroom shares one address, so this allows a room to sign in
# and out freely while stopping a script from creating accounts in bulk.
DEMO_LOGIN_LIMIT = RateLimiter(max_calls=60, window_seconds=600)
# Behind a proxy the client address comes from X-Forwarded-For, which a script can vary, so
# a cap across everyone backs up the per-address limit. A class of 40 fits well inside it.
DEMO_LOGIN_TOTAL_LIMIT = RateLimiter(max_calls=300, window_seconds=600)
ALL_CALLERS = "all"
DEMO_RESET_LIMIT = RateLimiter(max_calls=20, window_seconds=HOUR_SECONDS)

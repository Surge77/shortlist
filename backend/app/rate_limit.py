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


# Generous for real use, tight enough that one account cannot drain the shared quota.
APPLY_LIMIT = RateLimiter(max_calls=10, window_seconds=HOUR_SECONDS)
GEMINI_HR_LIMIT = RateLimiter(max_calls=60, window_seconds=HOUR_SECONDS)

"""UK size label parsing. Labels are free text ("UK 12", "12", "uk14", "M")."""

from __future__ import annotations

import re

_LETTER_TO_UK = {"xxs": 4, "xs": 6, "s": 8, "m": 12, "l": 16, "xl": 20, "xxl": 24}


def parse_uk_size(label: str | None) -> int | None:
    if not label:
        return None
    s = label.strip().lower()
    m = re.search(r"(\d{1,2})", s)
    if m:
        n = int(m.group(1))
        if "us" in s:
            n += 4  # US → UK
        if "eu" in s:
            n -= 28  # EU → UK (approx)
        return n if 2 <= n <= 40 else None
    return _LETTER_TO_UK.get(s.replace("uk", "").strip())

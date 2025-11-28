from datetime import datetime

def dates_close(d1, d2, max_days=3):
    """Return True if dates are identical OR within max_days difference."""
    if not d1 or not d2:
        return False
    if isinstance(d1, str):
        d1 = datetime.strptime(d1, "%Y-%m-%d").date()
    if isinstance(d2, str):
        d2 = datetime.strptime(d2, "%Y-%m-%d").date()

    return abs((d1 - d2).days) <= max_days

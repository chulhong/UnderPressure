"""Badge logic: streaks, first-of-month, milestones (e.g. 100th entry)."""

from datetime import date, timedelta

from .storage import get_all


def compute_badges() -> list[dict]:
    """
    Returns list of { id, label, value, earned }.
    """
    records = get_all()
    # Days that have at least one measurement
    dates_with_data = sorted({r.date for r in records if r.has_any_measurement()})
    if not dates_with_data:
        return []

    badges = []
    today = date.today()

    # Current streak: consecutive days ending today (or yesterday if today not logged)
    streak = 0
    if today in dates_with_data:
        d = today
        while d in dates_with_data:
            streak += 1
            d -= timedelta(days=1)
    else:
        d = today - timedelta(days=1)
        while d in dates_with_data:
            streak += 1
            d -= timedelta(days=1)
    if streak > 0:
        badges.append({"id": "streak", "label": "Current streak", "value": streak, "earned": True})

    # First of the month count
    first_count = sum(1 for d in dates_with_data if d.day == 1)
    badges.append({
        "id": "first_of_month",
        "label": "First of the month",
        "value": first_count,
        "earned": first_count > 0,
    })

    # Milestones
    total = len(dates_with_data)
    for n in [10, 50, 100, 250]:
        if total >= n:
            badges.append({
                "id": f"entries_{n}",
                "label": f"{n} entries",
                "value": n,
                "earned": True,
            })

    return badges

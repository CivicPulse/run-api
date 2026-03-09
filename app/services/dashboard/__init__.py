"""Dashboard aggregation services."""

from app.services.dashboard.canvassing import CanvassingDashboardService
from app.services.dashboard.phone_banking import PhoneBankingDashboardService
from app.services.dashboard.volunteer import VolunteerDashboardService

__all__ = [
    "CanvassingDashboardService",
    "PhoneBankingDashboardService",
    "VolunteerDashboardService",
]

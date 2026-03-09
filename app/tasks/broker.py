"""TaskIQ broker configuration.

InMemoryBroker for local development. Swap to a Redis or RabbitMQ broker
for production deployments.
"""

from __future__ import annotations

from taskiq import InMemoryBroker

broker = InMemoryBroker()

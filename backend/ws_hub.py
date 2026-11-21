"""
Obsidian Terminal - WebSocket Hub
Real-Time State Delta & Telemetry Broadcast Manager
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("ws_hub")


class WebSocketHub:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info("WebSocket connected. Active clients: %d", len(self.active_connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info("WebSocket disconnected. Active clients: %d", len(self.active_connections))

    async def broadcast(self, message: Dict[str, Any]) -> None:
        if not self.active_connections:
            return

        payload_text = json.dumps(message)
        dead_connections: Set[WebSocket] = set()

        async with self._lock:
            for connection in list(self.active_connections):
                try:
                    await connection.send_text(payload_text)
                except Exception as exc:
                    logger.warning("Error broadcasting to WebSocket: %s", exc)
                    dead_connections.add(connection)

            for dead in dead_connections:
                self.active_connections.discard(dead)


# Global singleton hub
ws_hub = WebSocketHub()

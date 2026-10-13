"""A request-size limit enforced while the body is read.

Checking Content-Length alone is not enough: a chunked upload has no length header, and
Starlette would spool the whole body to disk before the route's own size check runs.
This middleware counts bytes as they arrive and answers 413 the moment the limit passes.
"""

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

HTTP_PAYLOAD_TOO_LARGE = 413


class _BodyTooLarge(Exception):
    pass


class BodySizeLimit:
    def __init__(self, app: ASGIApp, max_bytes: int, message: str) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.body = json.dumps({"detail": message}).encode()

    async def _refuse(self, send: Send) -> None:
        headers = [(b"content-type", b"application/json"), (b"content-length", str(len(self.body)).encode())]
        await send({"type": "http.response.start", "status": HTTP_PAYLOAD_TOO_LARGE, "headers": headers})
        await send({"type": "http.response.body", "body": self.body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > self.max_bytes:
            await self._refuse(send)
            return

        received = 0
        exceeded = False
        refused = False

        async def counting_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    exceeded = True
                    raise _BodyTooLarge()
            return message

        # FastAPI turns a failure while parsing the body into its own 400, so once the
        # limit has passed, whatever the app tries to send is replaced by the 413.
        async def guarded_send(message: Message) -> None:
            nonlocal refused
            if not exceeded:
                await send(message)
            elif not refused:
                refused = True
                await self._refuse(send)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _BodyTooLarge:
            pass
        if exceeded and not refused:
            await self._refuse(send)

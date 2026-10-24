"""Standard error definitions and centralized exception handlers."""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ErrorDetail(BaseModel):
    """Standardized error detail schema."""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Standardized global error response envelope."""

    error: ErrorDetail


class AppError(Exception):
    """Base domain exception with status code and error code."""

    code: str = "INTERNAL_ERROR"
    status_code: int = 500

    def __init__(
        self,
        message: str,
        code: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class AuthenticationError(AppError):
    """Raised when request lacks valid authentication credentials."""

    code = "UNAUTHORIZED"
    status_code = 401

    def __init__(self, message: str = "Invalid or missing API key") -> None:
        super().__init__(message=message, code=self.code, status_code=self.status_code)


class ValidationError(AppError):
    """Raised when client input fails business validation."""

    code = "VALIDATION_ERROR"
    status_code = 400

    def __init__(self, message: str = "Invalid request parameters") -> None:
        super().__init__(message=message, code=self.code, status_code=self.status_code)


class NotFoundError(AppError):
    """Raised when a requested resource does not exist."""

    code = "NOT_FOUND"
    status_code = 404

    def __init__(self, message: str = "Requested resource not found") -> None:
        super().__init__(message=message, code=self.code, status_code=self.status_code)


class PayloadTooLargeError(AppError):
    """Raised when uploaded file exceeds allowed size limits."""

    code = "PAYLOAD_TOO_LARGE"
    status_code = 413

    def __init__(self, message: str = "Uploaded file exceeds maximum allowed size") -> None:
        super().__init__(message=message, code=self.code, status_code=self.status_code)


class UnparseableDocumentError(AppError):
    """Raised when uploaded document cannot be parsed into graph models."""

    code = "UNPARSEABLE_DOCUMENT"
    status_code = 422

    def __init__(self, message: str = "Document content cannot be parsed") -> None:
        super().__init__(message=message, code=self.code, status_code=self.status_code)


class UpstreamServiceError(AppError):
    """Raised when an external service (Neo4j, LLM provider) fails."""

    code = "UPSTREAM_ERROR"
    status_code = 502

    def __init__(self, message: str = "Upstream service failure") -> None:
        super().__init__(message=message, code=self.code, status_code=self.status_code)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    """Handle domain AppError exceptions with standard envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic/FastAPI request validation errors."""
    error_messages: list[str] = []
    for err in exc.errors():
        loc = " -> ".join(str(item) for item in err.get("loc", []))
        msg = err.get("msg", "Invalid value")
        error_messages.append(f"{loc}: {msg}" if loc else msg)

    message = "; ".join(error_messages) if error_messages else "Request validation failed"
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "VALIDATION_ERROR", "message": message}},
    )


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """Handle standard FastAPI HTTPExceptions."""
    code = "UNAUTHORIZED" if exc.status_code == 401 else "HTTP_ERROR"
    message = str(exc.detail) if exc.detail else "An HTTP error occurred"
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": code, "message": message}},
    )


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler for unhandled exceptions to prevent stack trace leaks."""
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected internal error occurred.",
            }
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all centralized exception handlers to the FastAPI app."""
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

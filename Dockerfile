# One service: Node builds the React app, then FastAPI serves it beside the API, so the
# browser talks to a single origin and needs no CORS.

FROM node:22-slim AS frontend
WORKDIR /app/frontend
# Public values, baked into the bundle at build time (Railway passes service variables
# as build args when they are declared here). The anon key is public by design.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.11-slim
WORKDIR /app/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
# app/config.py serves ../frontend/dist when it exists.
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --create-home shortlist
USER shortlist
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]

# SignLine on Fly.io (fly.toml): the FastAPI server plus the built web app on one origin.
# Keys come from Fly secrets, never from a baked-in .env.

# Web build: same origin as the API, so no VITE_API_BASE and base '/'.
FROM node:24-bookworm AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN python3 scripts/setup_assets.py && npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/app ./app
COPY --from=web /src/web/dist ./web
ENV WEB_DIR=/app/web
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]

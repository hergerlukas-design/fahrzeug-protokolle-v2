# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Supabase-Credentials werden zur Build-Zeit als ARG übergeben
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_KEY
ARG VITE_APP_PASSWORD

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_KEY=$VITE_SUPABASE_KEY
ENV VITE_APP_PASSWORD=$VITE_APP_PASSWORD

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

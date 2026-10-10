# ---------- 前端构建 ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY apps/site/package.json apps/site/
COPY apps/admin/package.json apps/admin/
RUN npm install --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/site apps/site
COPY apps/admin apps/admin
RUN npm run build -w @wsim/site && npm run build -w @wsim/admin

# ---------- 服务端运行 ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server/package.json server/
RUN npm install --omit=dev --no-audit --no-fund -w server
COPY server server
COPY --from=build /app/apps/site/dist apps/site/dist
COPY --from=build /app/apps/admin/dist apps/admin/dist
WORKDIR /app/server
RUN npx prisma generate
EXPOSE 8080
# 启动：应用 schema -> 种子数据（幂等）-> 启动服务。默认仅绑定 127.0.0.1，可用 HOST 覆盖（内网演示时显式确认）
CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js && node src/index.js"]

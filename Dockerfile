# 构建 Vite 前端产物（根目录结构）。
FROM oven/bun:1.3.13 AS web-build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . ./
RUN bun run build

# 运行镜像：nginx 静态服务，AI 请求由浏览器经 new-api 网关转发。
FROM nginx:1.27-alpine

COPY --from=web-build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

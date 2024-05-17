# 第一阶段：构建阶段
FROM node:20.12.1 AS build-stage

WORKDIR /app

# 复制项目文件到容器
COPY . /app

# 安装依赖
RUN npm install

# 构建项目
RUN npm run build

# 第二階段：运行时阶段
FROM node:20.12.1 AS runtime-stage

#2、作者
MAINTAINER bobovinch

# 创建工作目录
RUN mkdir -p /app
WORKDIR /app

# 从构建阶段复制 dist 目录到运行时阶段
COPY --from=build-stage /app/dist /app/dist

# 复制其他必要文件
COPY ./package.json /app/
COPY ./.env.* /app/

# 安装生产环境依赖
RUN npm install --production

# 设置环境变量
ENV NODE_ENV=production
ENV CONFIG_COMFYUI_QUENE_REDIS_HOST=172.17.0.4
ENV CONFIG_COMFYUI_QUENE_REDIS_PORT=6379
# ENV CONFIG_COMFYUI_SERVER_URL=http://127.0.0.1:8188

# 暴露端口
EXPOSE 3001
EXPOSE 3002

# 设置入口点为启动脚本
ENTRYPOINT ["npm", "run", "start:prod"]
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# curl, gnupg, Node.js 22 및 Electron 빌드에 필요한 리눅스 시스템 종속성 패키지 설치
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgtk-3-0 \
    libgbm1 \
    libasound2t64 \
    libxshmfence1 \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# Whisper 네이티브 공유 라이브러리 경로 환경변수 설정
ENV LD_LIBRARY_PATH=/app/node_modules/@kutalia/whisper-node-addon/dist/linux-x64

WORKDIR /app

# package.json 및 package-lock.json 복사
COPY package*.json ./

# git이 없는 Docker 빌드 환경에서 lefthook install 에러 방지를 위해 prepare 스크립트 삭제 후 의존성 설치
RUN npm pkg delete scripts.prepare && npm ci

# 소스코드 전체 복사
COPY . .

# 컨테이너 실행 시 기본적으로 Linux 패키징(AppImage 등)을 수행하도록 설정
CMD ["npm", "run", "pack:linux"]

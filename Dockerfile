FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="/opt/venv/bin:${PATH}"
ENV PYTHON_BIN=/opt/venv/bin/python
ENV SPARK_DRIVER_MEMORY=2g

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY spark-engine/requirements.txt spark-engine/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r spark-engine/requirements.txt

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ backend/
COPY spark-engine/ spark-engine/

RUN python spark-engine/generate_data.py \
    && mkdir -p output \
    && chown -R node:node spark-engine output

WORKDIR /app/backend
USER node

CMD ["node", "server.js"]

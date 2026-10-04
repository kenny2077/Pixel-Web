FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 PIXELWEB_PYTHON=/opt/pdf/bin/python3
COPY package.json package-lock.json requirements-pdf.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev && python3 -m venv /opt/pdf && /opt/pdf/bin/pip install --no-cache-dir -r requirements-pdf.txt
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
EXPOSE 4173
CMD ["node", "server.mjs"]

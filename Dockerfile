FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 PIXELWEB_PYTHON=/opt/pdf/bin/python3 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json requirements-pdf.txt ./
# Install only Chromium's headless shell and its system libraries; the full Playwright image also ships Firefox and WebKit.
RUN npm ci --omit=dev \
 && npx playwright install --with-deps --only-shell chromium \
 && apt-get install -y --no-install-recommends python3-venv \
 && python3 -m venv /opt/pdf && /opt/pdf/bin/pip install --no-cache-dir -r requirements-pdf.txt \
 && rm -rf /var/lib/apt/lists/* /root/.cache /root/.npm
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
EXPOSE 4173
CMD ["node", "server.mjs"]

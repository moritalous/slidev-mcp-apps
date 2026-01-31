FROM node:24-bookworm

WORKDIR /app

RUN npx -y playwright install-deps

COPY *package*.json ./

RUN npm install

COPY . ./

RUN npm run build:all

ENV PORT=8000

EXPOSE 8000

# # Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3001/mcp', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "build/index.js"]
# CMD ["node", "build/index.js", "--stdio]

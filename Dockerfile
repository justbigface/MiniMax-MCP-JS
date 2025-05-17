FROM node:20-alpine

WORKDIR /app

ENV API_KEY=dummy \
    API_HOST=https://api.minimax.chat

RUN npm config set registry https://registry.npmjs.org/ \
 && npm install -g minimax-mcp-js@latest

ENTRYPOINT ["minimax-mcp-js", "--mode=rest", "--host=0.0.0.0"]


EXPOSE 3000

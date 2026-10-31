FROM node:24-slim AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Test stage (runs unit tests, typechecks, etc.)
FROM base AS test
ENV NODE_ENV=test
CMD ["npm", "test"]

# Production CLI runner stage
FROM node:24-slim AS runner
WORKDIR /app

COPY package.json ./
COPY --from=base /app/dist ./dist
COPY --from=base /app/bff-interpreter.js /app/README.md /app/LICENSE ./

RUN npm link

ENTRYPOINT ["bff-interpreter"]
CMD ["-c", "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++."]

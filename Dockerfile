# syntax=docker/dockerfile:1

FROM node:22-alpine

WORKDIR /app

# Use the Yarn version pinned via package.json "packageManager" / .yarnrc.yml yarnPath
RUN corepack enable

# Install dependencies first to maximize layer caching.
# devDependencies are required at runtime because the app is executed with tsx.
COPY .yarnrc.yml package.json yarn.lock ./
COPY .yarn/ ./.yarn/
RUN yarn install --immutable

# Copy the rest of the source
COPY . .

# The bot is a long-running gateway process executed directly from TypeScript via tsx.
# (No build step / no HTTP port.)
CMD ["yarn", "start"]

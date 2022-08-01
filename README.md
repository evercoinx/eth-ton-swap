## Description

The ETH-TON swap is a web service that allows users to swap fungible tokens between Ethereum (ERC-20) and TON (Jetton)
blockchains. It provides a REST API with the frontend clients and contains background jobs to perform management tasks
for the TON blockchain.

## Engine & Package Manager Requirements

-   Node >= 17
-   NPM >= 8

## External Service Dependencies

The swap serivce depends on the following external services:

-   PostgreSQL >= 14
-   Redis >= 6
-   Nginx >= 1.2
-   Certbot >= 1.2

## Installation

```bash
# install app dependencies
$ npm install
```

## Database Migrations

```bash
# run all migrations
$ npm run migration:up

# revert all migrations
$ npm run migration:down

# create a new migration
$ npm run migration:new

# generate a migration automatically with schema changes
$ npm run migration:auto
```

## Application Startup

```bash
# run in development mode
$ npm run start

# run in development watch mode
$ npm run start:dev

# run in production mode
$ npm run start:prod
```

## Format, Lint & Test

```bash
# format the code
$ npm run format

# lint the code
$ npm run lint

# run unit tests
$ npm run test

# run test coverage
$ npm run test:cov
```

## Docker Deployment

```bash
# run the app and external services
$ npm run service:up

# stop the app and external services
$ npm run service:down

# connect with the database service
$ npm run service:psql

# create a dump from the database service
$ npm run service:pgdump

```

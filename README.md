## Application Description

The ETH-TON swap is a web service that allows users to swap fungible tokens between the Ethereum (ERC-20) and the TON
(Jetton) blockchains in both directions. It exposes a REST API to frontend clients and contains background jobs to
perform management tasks in the blockchains.

## Engine & Package Manager Requirements

-   Node >= 17
-   NPM >= 8

## External Service Dependencies

The swap serivce depends on the following external services:

-   PostgreSQL >= 14
-   Redis >= 6
-   Nginx >= 1.2 (for production only)
-   Certbot >= 1.2 (for production only)

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

# create a new empty migration
$ npm run migration:new

# generate a migration automatically based on a schema's difference
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

## API Methods Description

### Swaps processing

-   POST /swaps - Create a swap between the ERC20 token (in Ethereum and the jetton in TON
-   DELETE /swaps/{id} - Cancel the swap
-   GET /swaps/{id} - Get the swap
-   GET /swaps/{id-prefix}/search - Search all swaps matched by their id prefix

### Ethereum management

-   PUT /eth/wallets/transfer-ethers - Transfer ethers between accounts
-   PUT /eth/wallets/transer-tokens - Transfer the tokens between accounts
-   GET /eth/wallets/token-data - Get a list of tokens' data for the given account

### TON management

-   POST /ton/wallets - Deploy a wallet contract
-   PUT /ton/wallets/transfer-toncoins - Transfer toncoins between wallets
-   PUT /ton/wallets/transfer-jettons - Transfer jettons between wallets
-   PUT /ton/wallets/burn-jettons - Burn jettons from the wallet
-   GET /ton/wallets/data - Get wallet data for the given account
-   GET /ton/wallets/jetton-data - Get wallet's jetton data for the given account
-   POST /ton/minters - Deploy a minter contract
-   PUT /ton/minters/mint - Mint jettons on the minter contract
-   GET /ton/minters/data - Get minter contract's data for the given account

### Wallets management

-   POST /wallets/create - Create a wallet (in TON) or an account (in Ethereum) and transfer toncoins (ethers) to it
-   POST /wallets/attach - Attach the already existing wallet (in TON) or the account (in Ethereum) to the swap service
-   PUT /wallets/{id} - Update the wallet's/account's data at the swap service
-   DELETE /wallets/{id} - Detach the wallet/account from the swap service
-   GET /wallets - Get a list of wallets/accounts from the swap service
-   GET /wallets/{id} - Get a list of wallets/accounts from the swap service

### Tokens management

-   POST /tokens - Register the ERC20 token or the jetton at the swap service
-   PUT /tokens - Update the ERC20 token or the jetton registered at the swap service
-   GET /tokens - Get all ERC20 tokens and jettons registered at the swap service
-   GET /token/{id} - Get the given ERC20 token or the jetton registered at the swap service

### Settings

-   POST /settings - Add the settings for the Ethereum or TON blockchain
-   GET /settings - Get the settings for the Ethereum or TON blockchain

### Stats

-   GET /stats - Get the current swap statistics at the swap service

### Tasks

-   POST /tasks/deposit-wallet-balances - Deposit balances of wallets (in TON) or accounts (in Ethereum)
-   POST /tasks/sync-wallets-token-balance - Synchronize balances of wallets/accounts with the corresponding blockchain
-   POST /tasks/sync-tokens-price - Synchronize the price of ERC20 tokens (for Ethereum only)
-   POST /tasks/sync-settings-gas-fee - Synchronize the gas price (for Ethereum only)

### Authentication

-   POST /auth/login - Login the admin user

import BigNumber from "bignumber.js"

export enum Environment {
	Development = "development",
	Staging = "staging",
	Production = "production",
}

export default () => ({
	environment: process.env.NODE_ENV,
	application: {
		host: process.env.APP_HOST,
		port: parseInt(process.env.APP_PORT, 10),
		logLevel: process.env.APP_LOG_LEVEL,
		jwtSecret: process.env.APP_JWT_SECRET,
		jwtExpiresIn: process.env.APP_JWT_EXPIRES_IN,
		cacheTtl: parseInt(process.env.APP_CACHE_TTL, 10),
	},
	database: {
		host: process.env.DB_HOST,
		port: parseInt(process.env.DB_PORT, 10),
		username: process.env.DB_USER,
		password: process.env.DB_PASS,
		name: process.env.DB_NAME,
	},
	redis: {
		host: process.env.REDIS_HOST,
		port: parseInt(process.env.REDIS_PORT, 10),
		db: parseInt(process.env.REDIS_DB, 10),
		password: process.env.REDIS_PASS,
		keyPrefix: process.env.REDIS_KEY_PREFIX,
	},
	infura: {
		projectId: process.env.INFURA_PROJECT_ID,
		projectSecret: process.env.INFURA_PROJECT_SECRET,
	},
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY,
	},
	toncenter: {
		apiKey: process.env.TONCENTER_API_KEY,
	},
	coinmarketcap: {
		apiKey: process.env.COINMARKETCAP_API_KEY,
	},
	bridge: {
		jettonContentUri: new URL(process.env.BRIDGE_JETTON_CONTENT_URI),
		feePercent: parseFloat(process.env.BRIDGE_FEE_PERCENT),
		minSwapAmount: new BigNumber(process.env.BRIDGE_MIN_SWAP_AMOUNT),
		maxSwapAmount: new BigNumber(process.env.BRIDGE_MAX_SWAP_AMOUNT),
	},
})

export default () => ({
	environment: process.env.NODE_ENV,
	application: {
		port: parseInt(process.env.APP_PORT, 10),
		jwtSecret: process.env.APP_JWT_SECRET,
		jwtExpiresIn: process.env.APP_JWT_EXPIRES_IN,
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
	},
	bridge: {
		feePercent: parseFloat(process.env.BRIDGE_FEE_PERCENT),
		minSwapAmount: parseFloat(process.env.BRIDGE_MIN_SWAP_AMOUNT),
		maxSwapAmount: parseFloat(process.env.BRIDGE_MAX_SWAP_AMOUNT),
	},
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY,
	},
	infura: {
		projectId: process.env.INFURA_PROJECT_ID,
		projectSecret: process.env.INFURA_PROJECT_SECRET,
	},
	coinmarketcap: {
		apiKey: process.env.COINMARKETCAP_API_KEY,
	},
})

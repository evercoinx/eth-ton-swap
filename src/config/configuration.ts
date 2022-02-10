export default () => ({
	environment: process.env.NODE_ENV,
	application: {
		port: parseInt(process.env.APP_PORT, 10),
	},
	database: {
		host: process.env.DB_HOST,
		port: parseInt(process.env.DB_PORT, 10),
		username: process.env.DB_USER,
		password: process.env.DB_PASS,
		name: process.env.DB_NAME,
	},
	infura: {
		projectId: process.env.INFURA_PROJECT_ID,
		projectSecret: process.env.INFURA_PROJECT_SECRET,
	},
})

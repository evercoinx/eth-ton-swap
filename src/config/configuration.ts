export default () => ({
	environment: process.env.NODE_ENV,
	port: parseInt(process.env.NODE_PORT, 10) || 3000,
	database: {
		host: process.env.DATABASE_HOST,
		port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
	},
})
export enum Environment {
	Development = "development",
	Staging = "staging",
	Production = "production",
}

export function getAllEnvironments() {
	return [Environment.Development, Environment.Staging, Environment.Production]
}

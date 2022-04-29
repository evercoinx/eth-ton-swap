import { WalletsStats } from "../interfaces/wallets-stats.interface"

export class GetWalletsStatsDto {
	wallets: Record<string, WalletsStats>
}

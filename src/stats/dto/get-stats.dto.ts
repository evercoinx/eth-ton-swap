import { WalletsStats } from "../interfaces/wallets-stats.interface"

export class GetStatsDto {
	wallets: Record<string, WalletsStats>
	swaps: Record<string, Record<string, number>>
}

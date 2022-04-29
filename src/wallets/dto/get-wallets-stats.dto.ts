import { WalletStats } from "../interfaces/wallet-stats.interface"

export class GetWalletsStatsDto {
	wallets: Record<string, WalletStats>
}

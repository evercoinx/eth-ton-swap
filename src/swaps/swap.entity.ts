import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"
import { SWAP_EXPIRATION_INTERVAL } from "./constants"
import { getAllSwapStatuses, SwapStatus } from "./enums/swap-status.enum"

@Entity("swap")
export class Swap {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Index()
	@ManyToOne(() => Token, (token) => token.sourceSwaps)
	@JoinColumn({ name: "source_token_id" })
	sourceToken: Token

	@Column({
		type: "varchar",
		length: 48,
		name: "source_address",
		nullable: true,
	})
	sourceAddress?: string

	@Column({
		type: "varchar",
		length: 48,
		name: "source_conjugated_address",
		nullable: true,
	})
	sourceConjugatedAddress?: string

	@Check(`"source_amount" >= 0`)
	@Column({
		type: "decimal",
		name: "source_amount",
	})
	sourceAmount: string

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.sourceSwaps)
	@JoinColumn({ name: "source_wallet_id" })
	sourceWallet: Wallet

	@Column({
		type: "varchar",
		length: 64,
		name: "source_transaction_id",
		nullable: true,
	})
	sourceTransactionId?: string

	@Index()
	@ManyToOne(() => Token, (token) => token.destinationSwaps)
	@JoinColumn({ name: "destination_token_id" })
	destinationToken: Token

	@Column({
		type: "varchar",
		length: 48,
		name: "destination_address",
	})
	destinationAddress: string

	@Column({
		type: "varchar",
		length: 48,
		name: "destination_conjugated_address",
		nullable: true,
	})
	destinationConjugatedAddress?: string

	@Check(`"destination_amount" >= 0`)
	@Column({
		type: "decimal",
		name: "destination_amount",
		nullable: true,
	})
	destinationAmount?: string

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.destinationSwaps)
	@JoinColumn({ name: "destination_wallet_id" })
	destinationWallet: Wallet

	@Column({
		type: "varchar",
		length: 64,
		name: "destination_transaction_id",
		nullable: true,
	})
	destinationTransactionId?: string

	@Check(`"fee" >= 0`)
	@Column({
		type: "decimal",
		name: "fee",
		nullable: true,
	})
	fee?: string

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.collectorSwaps)
	@JoinColumn({ name: "collector_wallet_id" })
	collectorWallet: Wallet

	@Column({
		type: "varchar",
		length: 64,
		name: "collector_transaction_id",
		nullable: true,
	})
	collectorTransactionId?: string

	@Column({
		type: "varchar",
		length: 64,
		name: "burn_transaction_id",
		nullable: true,
	})
	burnTransactionId?: string

	@Column({
		type: "enum",
		enum: getAllSwapStatuses(),
		name: "status",
		enumName: "swap_status_enum",
		default: SwapStatus.Pending,
	})
	status: SwapStatus

	@Check(`"status_code" >= 0`)
	@Column({
		type: "integer",
		name: "status_code",
		nullable: true,
	})
	statusCode: number

	@Check(`"confirmations" >= 0`)
	@Column({
		type: "integer",
		name: "confirmations",
		default: 0,
	})
	confirmations: number

	@Index()
	@Column({
		type: "inet",
		name: "ip_address",
	})
	ipAddress: string

	@Column({
		type: "timestamptz",
		name: "ordered_at",
	})
	orderedAt: Date

	@CreateDateColumn({
		type: "timestamptz",
		name: "created_at",
	})
	createdAt: Date

	@UpdateDateColumn({
		type: "timestamptz",
		name: "updated_at",
	})
	updatedAt: Date

	@Column({
		type: "timestamptz",
		name: "expires_at",
	})
	expiresAt: Date

	get extendedExpiresAt() {
		return new Date(this.expiresAt.getTime() + SWAP_EXPIRATION_INTERVAL * 3)
	}

	get ultimateExpiresAt() {
		return new Date(this.expiresAt.getTime() + SWAP_EXPIRATION_INTERVAL * 12)
	}
}

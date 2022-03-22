import {
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

export enum SwapStatus {
	Pending = "pending",
	Confirmed = "confirmed",
	Completed = "completed",
	Expired = "expired",
	Failed = "failed",
}

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
		length: 60,
		name: "source_address",
		nullable: true,
	})
	sourceAddress: string | undefined

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
		length: 85,
		name: "source_transaction_id",
		nullable: true,
	})
	sourceTransactionId: string | undefined

	@Index()
	@ManyToOne(() => Token, (token) => token.destinationSwaps)
	@JoinColumn({ name: "destination_token_id" })
	destinationToken: Token

	@Column({
		type: "varchar",
		length: 60,
		name: "destination_address",
	})
	destinationAddress: string

	@Column({
		type: "decimal",
		name: "destination_amount",
		nullable: true,
	})
	destinationAmount: string | undefined

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.destinationSwaps)
	@JoinColumn({ name: "destination_wallet_id" })
	destinationWallet: Wallet

	@Column({
		type: "varchar",
		length: 85,
		name: "destination_transaction_id",
		nullable: true,
	})
	destinationTransactionId: string | undefined

	@Column({
		type: "decimal",
		name: "fee",
		nullable: true,
	})
	fee: string | undefined

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.collectorSwaps)
	@JoinColumn({ name: "collector_wallet_id" })
	collectorWallet: Wallet

	@Column({
		type: "varchar",
		length: 85,
		name: "collector_transaction_id",
		nullable: true,
	})
	collectorTransactionId: string | undefined

	@Column({
		type: "enum",
		enum: [
			SwapStatus.Pending,
			SwapStatus.Confirmed,
			SwapStatus.Completed,
			SwapStatus.Failed,
			SwapStatus.Expired,
		],
		name: "status",
		enumName: "",
		default: SwapStatus.Pending,
	})
	status: SwapStatus

	@Column({
		type: "integer",
		name: "block_confirmations",
		default: 0,
	})
	blockConfirmations: number

	@Index()
	@Column({
		type: "varchar",
		length: 39,
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
}

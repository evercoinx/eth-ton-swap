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
	Complete = "complete",
	Expired = "expired",
	Rejected = "rejected",
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
		length: 100,
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
	@ManyToOne(() => Token, (token) => token.destinationSwaps)
	@JoinColumn({ name: "destination_token_id" })
	destinationToken: Token

	@Column({
		type: "varchar",
		length: 100,
		name: "destination_address",
	})
	destinationAddress: string

	@Column({
		type: "decimal",
		name: "destination_amount",
		nullable: true,
	})
	destinationAmount: string | undefined

	@Column({
		type: "decimal",
		name: "fee",
		nullable: true,
	})
	fee: string | undefined

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.sourceSwaps)
	@JoinColumn({ name: "source_wallet_id" })
	sourceWallet: Wallet

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.destinationSwaps)
	@JoinColumn({ name: "destination_wallet_id" })
	destinationWallet: Wallet

	@Column({
		type: "enum",
		enum: SwapStatus,
		name: "status",
		default: SwapStatus.Pending,
	})
	status: SwapStatus

	@Column({
		type: "integer",
		name: "confirmed_block_count",
		default: 0,
	})
	confirmedBlockCount: number

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
}

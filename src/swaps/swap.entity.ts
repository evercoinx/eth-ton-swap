import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from "typeorm"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"

export enum SwapStatus {
	Pending = "Pending",
	Fulfilled = "Fulfilled",
	Rejected = "Rejected",
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

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.swaps)
	@JoinColumn({ name: "wallet_id" })
	wallet: Wallet

	@Column({
		type: "enum",
		enum: SwapStatus,
		name: "status",
		default: SwapStatus.Pending,
	})
	status: SwapStatus

	@Column({
		type: "timestamptz",
		name: "ordered_at",
	})
	orderedAt: Date

	@CreateDateColumn({
		type: "timestamptz",
		name: "created_at",
		default: () => "CURRENT_TIMESTAMP(3)",
	})
	createdAt: Date
}

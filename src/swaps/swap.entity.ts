import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm"
import { Wallet } from "../wallets/wallet.entity"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

export enum Token {
	Toncoin = "Toncoin",
	USDC = "USDC",
}

enum SwapStatus {
	Pending = "Pending",
	Confirmed = "Confirmed",
	Fulfilled = "Fulfilled",
	Rejected = "Rejected",
}

@Entity("swap")
export class Swap {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "source_blockchain",
	})
	sourceBlockchain: Blockchain

	@Column({
		type: "enum",
		enum: Token,
		name: "source_token",
	})
	sourceToken: Token

	@Column({
		type: "varchar",
		length: 100,
		name: "source_address",
		nullable: true,
	})
	sourceAddress: string | undefined

	@Column({
		type: "bigint",
		name: "source_amount",
	})
	sourceAmount: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "destination_blockchain",
	})
	destinationBlockchain: Blockchain

	@Column({
		type: "enum",
		enum: Token,
		name: "destination_token",
	})
	destinationToken: Token

	@Column({
		type: "varchar",
		length: 100,
		name: "destination_address",
	})
	destinationAddress: string

	@Column({
		type: "bigint",
		name: "destination_amount",
		nullable: true,
	})
	destinationAmount: string | undefined

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

	@Column({
		type: "timestamptz",
		name: "created_at",
		default: new Date(),
	})
	createdAt: Date

	@Index()
	@ManyToOne(() => Wallet, (wallet) => wallet.swaps)
	@JoinColumn({ name: "wallet_id" })
	wallet: Wallet
}

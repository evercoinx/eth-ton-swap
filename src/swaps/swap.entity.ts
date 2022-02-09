import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm"
import { Wallet } from "../wallets/wallet.entity"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

export enum Token {
	Toncoin = "Toncoin",
	USDC = "USDC",
}

@Entity()
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
	})
	sourceAddress: string

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
	})
	destinationAmount: string

	@OneToOne(() => Wallet)
	@JoinColumn({ name: "wallet_id" })
	wallet: Wallet

	@Column({
		type: "timestamptz",
		name: "created_at",
	})
	createdAt: Date

	@Column({
		type: "timestamptz",
		name: "registered_at",
	})
	registeredAt: Date
}

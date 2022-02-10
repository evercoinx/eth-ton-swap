import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from "typeorm"
import { Swap } from "../swaps/swap.entity"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

export enum Token {
	Toncoin = "Toncoin",
	USDC = "USDC",
}

@Entity("wallet")
export class Wallet {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "blockchain",
	})
	blockchain: Blockchain

	@Column({
		type: "enum",
		enum: Token,
		name: "token",
	})
	token: Token

	@Column({
		type: "varchar",
		length: 100,
		unique: true,
	})
	address: string

	@Column({
		type: "timestamptz",
		name: "created_at",
	})
	createdAt: Date

	@OneToMany(() => Swap, (swap) => swap.wallet)
	swaps: Swap[]
}

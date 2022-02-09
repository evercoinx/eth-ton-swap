import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

export enum Token {
	Toncoin = "Toncoin",
	Ether = "Ether",
	USDC = "USDC",
}

@Entity()
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
	})
	address: string

	@Column({
		type: "timestamptz",
		name: "registered_at",
	})
	registeredAt: Date
}

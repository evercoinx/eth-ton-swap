import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

@Entity("token")
export class Token {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "varchar",
		length: 30,
		name: "name",
	})
	name: string

	@Column({
		type: "varchar",
		length: 30,
		name: "symbol",
	})
	symbol: string

	@Column({
		type: "smallint",
		name: "decimals",
	})
	decimals: number

	@Column({
		type: "decimal",
		name: "price",
		nullable: true,
	})
	price: number | undefined

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "blockchain",
		unique: true,
	})
	blockchain: Blockchain

	@Column({
		type: "timestamptz",
		name: "updated_at",
	})
	updatedAt: Date
}

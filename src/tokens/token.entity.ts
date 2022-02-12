import { Swap } from "src/swaps/swap.entity"
import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from "typeorm"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

@Entity("token")
@Unique("name_blockchain_unique", ["name", "blockchain"])
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
		type: "enum",
		enum: Blockchain,
		name: "blockchain",
	})
	blockchain: Blockchain

	@Column({
		type: "integer",
		name: "coinmarketcap_id",
	})
	coinmarketcapId: number

	@Column({
		type: "decimal",
		name: "price",
		nullable: true,
	})
	price: number | undefined

	@OneToMany(() => Swap, (swap) => swap.sourceToken)
	sourceSwaps: Swap[]

	@OneToMany(() => Swap, (swap) => swap.destinationToken)
	destinationSwaps: Swap[]

	@Column({
		type: "timestamptz",
		name: "updated_at",
	})
	updatedAt: Date
}

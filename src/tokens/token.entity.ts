import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from "typeorm"
import { Swap } from "src/swaps/swap.entity"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

@Entity("token")
@Unique("blockchain_address_unique", ["blockchain", "address"])
export class Token {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "blockchain",
	})
	blockchain: Blockchain

	@Column({
		type: "varchar",
		length: 60,
		name: "address",
	})
	address: string

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
		type: "integer",
		name: "coinmarketcap_id",
	})
	coinmarketcapId: number

	@Column({
		type: "decimal",
		name: "price",
		nullable: true,
	})
	price: string | undefined

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

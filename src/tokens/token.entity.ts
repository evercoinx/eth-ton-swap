import {
	Column,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from "typeorm"
import { Swap } from "src/swaps/swap.entity"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

@Entity("token")
@Unique("blockchain_name_unique", ["blockchain", "name"])
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
		type: "varchar",
		length: 60,
		name: "address",
		nullable: true,
	})
	address: string | undefined

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

	@UpdateDateColumn({
		type: "timestamptz",
		name: "updated_at",
	})
	updatedAt: Date
}

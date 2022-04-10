import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from "typeorm"
import { Swap } from "src/swaps/swap.entity"

export enum Blockchain {
	TON = "ton",
	Ethereum = "ethereum",
}

@Entity("token")
@Unique("blockchain_name_unique", ["blockchain", "name"])
export class Token {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: [Blockchain.TON, Blockchain.Ethereum],
		name: "blockchain",
		enumName: "token_blockchain_enum",
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

	@Check(`"decimals" >= 0`)
	@Column({
		type: "smallint",
		name: "decimals",
	})
	decimals: number

	@Column({
		type: "integer",
		name: "coinmarketcap_id",
		nullable: true,
	})
	coinmarketcapId?: number

	@Column({
		type: "varchar",
		length: 48,
		name: "address",
	})
	address: string

	@Column({
		type: "varchar",
		length: 48,
		name: "conjugated_address",
		nullable: true,
	})
	conjugatedAddress?: string

	@Check(`"price" >= 0`)
	@Column({
		type: "decimal",
		name: "price",
		nullable: true,
	})
	price?: string

	@OneToMany(() => Swap, (swap) => swap.sourceToken)
	sourceSwaps: Swap[]

	@OneToMany(() => Swap, (swap) => swap.destinationToken)
	destinationSwaps: Swap[]

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

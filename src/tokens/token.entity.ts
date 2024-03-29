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
import { Blockchain, getAllBlockchains } from "src/common/enums/blockchain.enum"
import { Swap } from "src/swaps/swap.entity"

@Entity("token")
@Unique("blockchain_address_unique", ["blockchain", "address"])
export class Token {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: getAllBlockchains(),
		name: "blockchain",
		enumName: "token_blockchain_enum",
	})
	blockchain: Blockchain

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

	@Check(`"min_swap_amount" >= 0`)
	@Column({
		type: "decimal",
		name: "min_swap_amount",
	})
	minSwapAmount: string

	@Check(`"max_swap_amount" >= 0`)
	@Column({
		type: "decimal",
		name: "max_swap_amount",
	})
	maxSwapAmount: string

	@Column({
		type: "integer",
		name: "coinmarketcap_id",
		nullable: true,
	})
	coinmarketcapId?: number

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

import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm"
import { Blockchain } from "src/tokens/token.entity"

@Entity("fee")
export class Fee {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: [Blockchain.Ethereum, Blockchain.TON],
		name: "blockchain",
		enumName: "fee_blockchain_enum",
		unique: true,
	})
	blockchain: Blockchain

	@Check(`"gas_fee" >= 0`)
	@Column({
		type: "decimal",
		name: "gas_fee",
		nullable: true,
	})
	gasFee?: string

	@Check(`"decimals" >= 0`)
	@Column({
		type: "smallint",
		name: "decimals",
	})
	decimals: number

	// @Check(`"min_swap_amount" >= 0`)
	// @Column({
	// 	type: "decimal",
	// 	name: "min_swap_amount",
	// })
	// minSwapAmount?: string

	// @Check(`"max_swap_amount" >= 0`)
	// @Column({
	// 	type: "decimal",
	// 	name: "max_swap_amount",
	// })
	// maxSwapAmount?: string

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

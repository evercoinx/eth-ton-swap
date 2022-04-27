import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm"
import { Blockchain } from "src/tokens/token.entity"

@Entity("setting")
export class Setting {
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

	@Check(`"min_token_amount" >= 0`)
	@Column({
		type: "decimal",
		name: "min_token_amount",
	})
	minTokenAmount?: string

	@Check(`"max_token_amount" >= 0`)
	@Column({
		type: "decimal",
		name: "max_token_amount",
	})
	maxTokenAmount?: string

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

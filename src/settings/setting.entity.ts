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

	@Check(`"currency_decimals" >= 0`)
	@Column({
		type: "smallint",
		name: "currency_decimals",
	})
	currencyDecimals: number

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

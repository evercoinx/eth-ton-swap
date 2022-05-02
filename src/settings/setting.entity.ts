import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm"
import { Blockchain, getAllBlockchains } from "src/common/enums/blockchain.enum"

@Entity("setting")
export class Setting {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: getAllBlockchains(),
		name: "blockchain",
		enumName: "setting_blockchain_enum",
		unique: true,
	})
	blockchain: Blockchain

	@Check(`"decimals" >= 0`)
	@Column({
		type: "smallint",
		name: "decimals",
	})
	decimals: number

	@Check(`"min_wallet_balance" >= 0`)
	@Column({
		type: "decimal",
		name: "min_wallet_balance",
	})
	minWalletBalance: string

	@Check(`"gas_fee" >= 0`)
	@Column({
		type: "decimal",
		name: "gas_fee",
		nullable: true,
	})
	gasFee?: string

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

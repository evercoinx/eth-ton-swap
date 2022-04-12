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
		enum: [Blockchain.TON, Blockchain.Ethereum],
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

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

@Entity("fee")
export class Fee {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "blockchain",
		unique: true,
	})
	blockchain: Blockchain

	@Column({
		type: "bigint",
		name: "max_fee_per_gas",
		default: "0",
	})
	maxFeePerGas: string

	@Column({
		type: "bigint",
		name: "max_priority_fee_per_gas",
		default: "0",
	})
	maxPriorityFeePerGas: string

	@Column({
		type: "bigint",
		name: "gas_price",
		default: "0",
	})
	gasPrice: string

	@Column({
		type: "timestamptz",
		name: "updated_at",
	})
	updatedAt: Date
}

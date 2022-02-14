import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

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
		type: "decimal",
		name: "gas_fee",
		nullable: true,
	})
	gasFee: string | undefined

	@UpdateDateColumn({
		type: "timestamptz",
		name: "updated_at",
	})
	updatedAt: Date
}

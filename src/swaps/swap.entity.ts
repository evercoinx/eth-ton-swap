import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

export enum Blockchain {
	TON = "TON",
	Ethereum = "Ethereum",
}

@Entity()
export class Swap {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "source_blockchain",
	})
	sourceBlockchain: Blockchain

	@Column({
		type: "varchar",
		length: 100,
		name: "source_address",
	})
	sourceAddress: string

	@Column({
		type: "bigint",
		name: "source_amount",
	})
	sourceAmount: string

	@Column({
		type: "enum",
		enum: Blockchain,
		name: "destination_blockchain",
	})
	destinationBlockchain: Blockchain

	@Column({
		type: "varchar",
		length: 100,
		name: "destination_address",
	})
	destinationAddress: string

	@Column({
		type: "bigint",
		name: "destination_amount",
	})
	destinationAmount: string

	@Column({
		type: "timestamptz",
		name: "created_at",
	})
	createdAt: Date

	@Column({
		type: "timestamptz",
		name: "registered_at",
	})
	registeredAt: Date
}

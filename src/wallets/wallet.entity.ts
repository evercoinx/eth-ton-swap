import { Exclude } from "class-transformer"
import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
} from "typeorm"
import { Swap } from "../swaps/swap.entity"
import { Token } from "../tokens/token.entity"

@Entity("wallet")
export class Wallet {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "varchar",
		length: 100,
		unique: true,
		name: "address",
	})
	address: string

	@Exclude()
	@Column({
		type: "varchar",
		length: 100,
		unique: true,
		name: "secret_key",
	})
	secretKey: string

	@Index()
	@ManyToOne(() => Token, (token) => token.sourceSwaps)
	@JoinColumn({ name: "token_id" })
	token: Token

	@OneToMany(() => Swap, (swap) => swap.wallet)
	swaps: Swap[]

	@CreateDateColumn({
		type: "timestamptz",
		name: "created_at",
		default: () => "CURRENT_TIMESTAMP(3)",
	})
	createdAt: Date
}

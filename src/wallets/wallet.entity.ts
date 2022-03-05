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
import { Swap } from "src/swaps/swap.entity"
import { Token } from "src/tokens/token.entity"

export enum WalletType {
	Transfer = "transfer",
	Collector = "collector",
}

@Entity("wallet")
export class Wallet {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Exclude()
	@Column({
		type: "varchar",
		length: 128,
		unique: true,
		name: "secret_key",
	})
	secretKey: string

	@Column({
		type: "varchar",
		length: 60,
		unique: true,
		name: "address",
	})
	address: string

	@Index()
	@ManyToOne(() => Token, (token) => token.sourceSwaps)
	@JoinColumn({ name: "token_id" })
	token: Token

	@OneToMany(() => Swap, (swap) => swap.sourceWallet)
	sourceSwaps: Swap[]

	@OneToMany(() => Swap, (swap) => swap.destinationToken)
	destinationSwaps: Swap[]

	@Column({
		type: "enum",
		enum: WalletType,
		name: "type",
		default: WalletType.Transfer,
	})
	type: WalletType

	@CreateDateColumn({
		type: "timestamptz",
		name: "created_at",
	})
	createdAt: Date
}

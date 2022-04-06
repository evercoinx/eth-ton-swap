import { Exclude } from "class-transformer"
import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm"
import { Swap } from "src/swaps/swap.entity"
import { Token } from "src/tokens/token.entity"

export enum WalletType {
	Transfer = "transfer",
	Collector = "collector",
	Minter = "minter",
}

@Entity("wallet")
export class Wallet {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Exclude()
	@Column({
		type: "varchar",
		length: 128,
		name: "secret_key",
	})
	secretKey: string

	@Column({
		type: "varchar",
		length: 48,
		unique: true,
		name: "address",
	})
	address: string

	@Column({
		type: "varchar",
		length: 48,
		unique: true,
		name: "related_address",
		nullable: true,
	})
	relatedAddress?: string

	@Check(`"balance" >= 0`)
	@Column({
		type: "decimal",
		name: "balance",
		nullable: true,
	})
	balance?: string

	@Index()
	@ManyToOne(() => Token, (token) => token.sourceSwaps)
	@JoinColumn({ name: "token_id" })
	token: Token

	@Column({
		type: "enum",
		enum: [WalletType.Transfer, WalletType.Collector, WalletType.Minter],
		name: "type",
		enumName: "wallet_type_enum",
		default: WalletType.Transfer,
	})
	type: WalletType

	@Column({
		type: "bool",
		default: true,
	})
	deployed: boolean

	@OneToMany(() => Swap, (swap) => swap.sourceWallet)
	sourceSwaps: Swap[]

	@OneToMany(() => Swap, (swap) => swap.destinationWallet)
	destinationSwaps: Swap[]

	@OneToMany(() => Swap, (swap) => swap.collectorWallet)
	collectorSwaps: Swap[]

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

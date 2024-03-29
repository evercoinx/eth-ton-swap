import * as bcrypt from "bcrypt"
import { Exclude } from "class-transformer"
import { BeforeInsert, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm"

@Entity("user")
export class User {
	@PrimaryGeneratedColumn("uuid")
	id: string

	@Column({
		type: "varchar",
		length: 30,
		name: "username",
		unique: true,
	})
	username: string

	@Exclude()
	@Column({
		type: "char",
		length: 60,
		name: "password",
	})
	password: string

	@BeforeInsert()
	async hashPassword() {
		const saltRounds = 10
		this.password = await bcrypt.hash(this.password, saltRounds)
	}

	@CreateDateColumn({
		type: "timestamptz",
		name: "created_at",
	})
	createdAt: Date
}

import { MigrationInterface, QueryRunner } from "typeorm"

export class addSwapStatus1648298701522 implements MigrationInterface {
	name = "addSwapStatus1648298701522"

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "public"."swap_status_enum" RENAME TO "swap_status_enum_old"`,
		)
		await queryRunner.query(
			`CREATE TYPE "public"."swap_status_enum" AS ENUM('pending', 'confirmed', 'completed', 'failed', 'expired', 'canceled')`,
		)
		await queryRunner.query(`ALTER TABLE "swap" ALTER COLUMN "status" DROP DEFAULT`)
		await queryRunner.query(
			`ALTER TABLE "swap" ALTER COLUMN "status" TYPE "public"."swap_status_enum" USING "status"::"text"::"public"."swap_status_enum"`,
		)
		await queryRunner.query(`ALTER TABLE "swap" ALTER COLUMN "status" SET DEFAULT 'pending'`)
		await queryRunner.query(`DROP TYPE "public"."swap_status_enum_old"`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "public"."swap_status_enum_old" AS ENUM('pending', 'confirmed', 'completed', 'failed', 'expired')`,
		)
		await queryRunner.query(`ALTER TABLE "swap" ALTER COLUMN "status" DROP DEFAULT`)
		await queryRunner.query(
			`ALTER TABLE "swap" ALTER COLUMN "status" TYPE "public"."swap_status_enum_old" USING "status"::"text"::"public"."swap_status_enum_old"`,
		)
		await queryRunner.query(`ALTER TABLE "swap" ALTER COLUMN "status" SET DEFAULT 'pending'`)
		await queryRunner.query(`DROP TYPE "public"."swap_status_enum"`)
		await queryRunner.query(
			`ALTER TYPE "public"."swap_status_enum_old" RENAME TO "swap_status_enum"`,
		)
	}
}

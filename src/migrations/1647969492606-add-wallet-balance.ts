import { MigrationInterface, QueryRunner } from "typeorm"

export class addWalletBalance1647969492606 implements MigrationInterface {
	name = "addWalletBalance1647969492606"

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "wallet" ADD "balance" numeric`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "wallet" DROP COLUMN "balance"`)
	}
}

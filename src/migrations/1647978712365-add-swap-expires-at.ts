import { MigrationInterface, QueryRunner } from "typeorm"

export class addSwapExpiresAt1647978712365 implements MigrationInterface {
	name = "addSwapExpiresAt1647978712365"

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "swap" ADD "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL`,
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "swap" DROP COLUMN "expires_at"`)
	}
}

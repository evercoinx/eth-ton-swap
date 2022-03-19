import { MigrationInterface, QueryRunner } from "typeorm"

export class addSwapIpAddress1647686777086 implements MigrationInterface {
	name = "addSwapIpAddress1647686777086"

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "swap" ADD "ip_address" character varying(39) NOT NULL`,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_d3fd1303e896a178a0310b5a57" ON "swap" ("ip_address")`,
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "public"."IDX_d3fd1303e896a178a0310b5a57"`)
		await queryRunner.query(`ALTER TABLE "swap" DROP COLUMN "ip_address"`)
	}
}

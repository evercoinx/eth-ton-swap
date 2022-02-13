import { MigrationInterface, QueryRunner } from "typeorm"

export class users1644767448120 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`INSERT INTO "user" (username, password, created_at) VALUES('tonicadmin', 'MyTonic2022', CURRENT_TIMESTAMP(3))`,
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DELETE FROM "user" WHERE username = 'tonicadmin'`)
	}
}

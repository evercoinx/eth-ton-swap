import { MigrationInterface, QueryRunner } from "typeorm"

export class createSchema1646738935292 implements MigrationInterface {
	name = "createSchema1646738935292"

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "fee" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "blockchain" "public"."fee_blockchain_enum" NOT NULL, "gas_fee" numeric, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_04ecf7266f17ea99f388615088b" UNIQUE ("blockchain"), CONSTRAINT "PK_ee7e51cc563615bc60c2b234635" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE TABLE "wallet" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "secret_key" character varying(128) NOT NULL, "address" character varying(60) NOT NULL, "type" "public"."wallet_type_enum" NOT NULL DEFAULT 'transfer', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "token_id" uuid, CONSTRAINT "UQ_1dcc9f5fd49e3dc52c6d2393c53" UNIQUE ("address"), CONSTRAINT "PK_bec464dd8d54c39c54fd32e2334" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_16874556fca7c6d5e88fd1c4c3" ON "wallet" ("token_id") `,
		)
		await queryRunner.query(
			`CREATE TABLE "swap" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source_address" character varying(60), "source_amount" numeric NOT NULL, "source_transaction_hash" character varying(64), "destination_address" character varying(60) NOT NULL, "destination_amount" numeric, "destination_transaction_hash" character varying(64), "fee" numeric, "collector_transaction_hash" character varying(64), "status" "public"."swap_status_enum" NOT NULL DEFAULT 'pending', "block_confirmations" integer NOT NULL DEFAULT '0', "ordered_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "source_token_id" uuid, "source_wallet_id" uuid, "destination_token_id" uuid, "destination_wallet_id" uuid, "collector_wallet_id" uuid, CONSTRAINT "PK_4a10d0f359339acef77e7f986d9" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_be75467462b80c3c9035e55ba6" ON "swap" ("source_token_id") `,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_bf26b52557108c749c432db846" ON "swap" ("source_wallet_id") `,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_d6985ba50d696ced8c5136cf68" ON "swap" ("destination_token_id") `,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_ee73c319fdb79c1851be94bf88" ON "swap" ("destination_wallet_id") `,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_c37ac78ef99a34fcfdcb44dfee" ON "swap" ("collector_wallet_id") `,
		)
		await queryRunner.query(
			`CREATE TABLE "token" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "blockchain" "public"."token_blockchain_enum" NOT NULL, "name" character varying(30) NOT NULL, "symbol" character varying(30) NOT NULL, "decimals" smallint NOT NULL, "coinmarketcap_id" integer NOT NULL, "address" character varying(60), "price" numeric, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "blockchain_name_unique" UNIQUE ("blockchain", "name"), CONSTRAINT "PK_82fae97f905930df5d62a702fc9" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(30) NOT NULL, "password" character(60) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ('now'::text)::timestamp(3) with time zone, CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`ALTER TABLE "wallet" ADD CONSTRAINT "FK_16874556fca7c6d5e88fd1c4c3f" FOREIGN KEY ("token_id") REFERENCES "token"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" ADD CONSTRAINT "FK_be75467462b80c3c9035e55ba60" FOREIGN KEY ("source_token_id") REFERENCES "token"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" ADD CONSTRAINT "FK_bf26b52557108c749c432db8463" FOREIGN KEY ("source_wallet_id") REFERENCES "wallet"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" ADD CONSTRAINT "FK_d6985ba50d696ced8c5136cf684" FOREIGN KEY ("destination_token_id") REFERENCES "token"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" ADD CONSTRAINT "FK_ee73c319fdb79c1851be94bf88d" FOREIGN KEY ("destination_wallet_id") REFERENCES "wallet"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" ADD CONSTRAINT "FK_c37ac78ef99a34fcfdcb44dfee7" FOREIGN KEY ("collector_wallet_id") REFERENCES "wallet"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "swap" DROP CONSTRAINT "FK_c37ac78ef99a34fcfdcb44dfee7"`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" DROP CONSTRAINT "FK_ee73c319fdb79c1851be94bf88d"`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" DROP CONSTRAINT "FK_d6985ba50d696ced8c5136cf684"`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" DROP CONSTRAINT "FK_bf26b52557108c749c432db8463"`,
		)
		await queryRunner.query(
			`ALTER TABLE "swap" DROP CONSTRAINT "FK_be75467462b80c3c9035e55ba60"`,
		)
		await queryRunner.query(
			`ALTER TABLE "wallet" DROP CONSTRAINT "FK_16874556fca7c6d5e88fd1c4c3f"`,
		)
		await queryRunner.query(`DROP TABLE "user"`)
		await queryRunner.query(`DROP TABLE "token"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_c37ac78ef99a34fcfdcb44dfee"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_ee73c319fdb79c1851be94bf88"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_d6985ba50d696ced8c5136cf68"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_bf26b52557108c749c432db846"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_be75467462b80c3c9035e55ba6"`)
		await queryRunner.query(`DROP TABLE "swap"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_16874556fca7c6d5e88fd1c4c3"`)
		await queryRunner.query(`DROP TABLE "wallet"`)
		await queryRunner.query(`DROP TABLE "fee"`)
	}
}

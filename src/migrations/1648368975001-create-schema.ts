import { MigrationInterface, QueryRunner } from "typeorm"

export class createSchema1648368975001 implements MigrationInterface {
	name = "createSchema1648368975001"

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "public"."setting_blockchain_enum" AS ENUM('ethereum', 'ton')`,
		)
		await queryRunner.query(
			`CREATE TABLE "setting" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "blockchain" "public"."setting_blockchain_enum" NOT NULL, "decimals" smallint NOT NULL, "min_wallet_balance" numeric NOT NULL, "gas_fee" numeric, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_5353895304e279fc80cce8688f0" UNIQUE ("blockchain"), CONSTRAINT "CHK_9d92c8b9fc83a6cb6f0cd03b89" CHECK ("decimals" >= 0), CONSTRAINT "CHK_040ecdc6a249da6376308f7023" CHECK ("min_wallet_balance" >= 0), CONSTRAINT "CHK_714983bf3d59dca0fcf81a1dd9" CHECK ("gas_fee" >= 0), CONSTRAINT "PK_fcb21187dc6094e24a48f677bed" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE TYPE "public"."token_blockchain_enum" AS ENUM('ethereum', 'ton')`,
		)
		await queryRunner.query(
			`CREATE TABLE "token" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "blockchain" "public"."token_blockchain_enum" NOT NULL, "address" character varying(48) NOT NULL, "conjugated_address" character varying(48), "name" character varying(30) NOT NULL, "symbol" character varying(30) NOT NULL, "decimals" smallint NOT NULL, "min_swap_amount" numeric NOT NULL, "max_swap_amount" numeric NOT NULL, "coinmarketcap_id" integer, "price" numeric, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "blockchain_address_unique" UNIQUE ("blockchain", "address"), CONSTRAINT "CHK_3f3967740393f773aee79557f2" CHECK ("decimals" >= 0), CONSTRAINT "CHK_ad030e10cc2b1d5c70843fbbe3" CHECK ("min_swap_amount" >= 0), CONSTRAINT "CHK_8a80f8802354ad719fcf0ea4b4" CHECK ("max_swap_amount" >= 0), CONSTRAINT "CHK_f3b906de8eb26a02abb26effc6" CHECK ("price" >= 0), CONSTRAINT "PK_82fae97f905930df5d62a702fc9" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE TYPE "public"."wallet_type_enum" AS ENUM('transferer', 'collector', 'minter', 'giver')`,
		)
		await queryRunner.query(
			`CREATE TABLE "wallet" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "secret_key" character varying(256) NOT NULL, "mnemonic" character varying(625), "address" character varying(48) NOT NULL, "conjugated_address" character varying(48), "balance" numeric, "type" "public"."wallet_type_enum" NOT NULL DEFAULT 'transferer', "deployed" boolean NOT NULL DEFAULT true, "in_use" boolean NOT NULL DEFAULT false, "disabled" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "token_id" uuid, CONSTRAINT "UQ_1dcc9f5fd49e3dc52c6d2393c53" UNIQUE ("address"), CONSTRAINT "UQ_6f3b4b38ee815999efd566956a3" UNIQUE ("conjugated_address"), CONSTRAINT "CHK_b20742bf0b42603d4f1eed0577" CHECK ("balance" >= 0), CONSTRAINT "PK_bec464dd8d54c39c54fd32e2334" PRIMARY KEY ("id"))`,
		)
		await queryRunner.query(
			`CREATE INDEX "IDX_16874556fca7c6d5e88fd1c4c3" ON "wallet" ("token_id") `,
		)
		await queryRunner.query(
			`CREATE TYPE "public"."swap_status_enum" AS ENUM('pending', 'confirmed', 'completed', 'expired', 'failed', 'canceled')`,
		)
		await queryRunner.query(
			`CREATE TABLE "swap" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source_address" character varying(48), "source_conjugated_address" character varying(48), "source_amount" numeric NOT NULL, "source_transaction_id" character varying(64), "destination_address" character varying(48) NOT NULL, "destination_conjugated_address" character varying(48), "destination_amount" numeric, "destination_transaction_id" character varying(64), "fee" numeric, "collector_transaction_id" character varying(64), "burn_transaction_id" character varying(64), "status" "public"."swap_status_enum" NOT NULL DEFAULT 'pending', "status_code" integer, "confirmations" integer NOT NULL DEFAULT '0', "ip_address" inet NOT NULL, "ordered_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "source_token_id" uuid, "source_wallet_id" uuid, "destination_token_id" uuid, "destination_wallet_id" uuid, "collector_wallet_id" uuid, CONSTRAINT "CHK_f721629fc1934fe4d5dda07597" CHECK ("source_amount" >= 0), CONSTRAINT "CHK_0fd5d3c23357c6ce22c0f214b1" CHECK ("destination_amount" >= 0), CONSTRAINT "CHK_f02e531b995b60640ba0c4e55c" CHECK ("fee" >= 0), CONSTRAINT "CHK_51c51e7da08beee6fe26bd8de3" CHECK ("status_code" >= 0), CONSTRAINT "CHK_1a4024a6730ad18cbff2743efd" CHECK ("confirmations" >= 0), CONSTRAINT "PK_4a10d0f359339acef77e7f986d9" PRIMARY KEY ("id"))`,
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
			`CREATE INDEX "IDX_d3fd1303e896a178a0310b5a57" ON "swap" ("ip_address") `,
		)
		await queryRunner.query(
			`CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(30) NOT NULL, "password" character(60) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
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
		await queryRunner.query(`DROP INDEX "public"."IDX_d3fd1303e896a178a0310b5a57"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_c37ac78ef99a34fcfdcb44dfee"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_ee73c319fdb79c1851be94bf88"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_d6985ba50d696ced8c5136cf68"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_bf26b52557108c749c432db846"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_be75467462b80c3c9035e55ba6"`)
		await queryRunner.query(`DROP TABLE "swap"`)
		await queryRunner.query(`DROP TYPE "public"."swap_status_enum"`)
		await queryRunner.query(`DROP INDEX "public"."IDX_16874556fca7c6d5e88fd1c4c3"`)
		await queryRunner.query(`DROP TABLE "wallet"`)
		await queryRunner.query(`DROP TYPE "public"."wallet_type_enum"`)
		await queryRunner.query(`DROP TABLE "token"`)
		await queryRunner.query(`DROP TYPE "public"."token_blockchain_enum"`)
		await queryRunner.query(`DROP TABLE "setting"`)
		await queryRunner.query(`DROP TYPE "public"."setting_blockchain_enum"`)
	}
}

import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createCipheriv, createDecipheriv, scrypt } from "crypto"
import { promisify } from "util"

@Injectable()
export class SecurityService {
	private readonly algorithm = "aes-256-ctr"
	private readonly initVector = Buffer.from("702e7b67b951d54dddff276b4f93f913", "hex")

	constructor(private readonly configService: ConfigService) {}

	async encryptText(plainText: string): Promise<string> {
		const password = this.configService.get<string>("database.secret")
		const key = await this.generateCypherKey(password)
		const cipher = createCipheriv(this.algorithm, key, this.initVector)

		const buffer = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()])
		return buffer.toString("base64")
	}

	async decryptText(encryptedText: string): Promise<string> {
		const password = this.configService.get<string>("database.secret")
		const key = await this.generateCypherKey(password)
		const decipher = createDecipheriv(this.algorithm, key, this.initVector)

		const buffer = Buffer.concat([
			decipher.update(Buffer.from(encryptedText, "base64")),
			decipher.final(),
		])
		return buffer.toString("utf-8")
	}

	private async generateCypherKey(password: string): Promise<Buffer> {
		return (await promisify(scrypt)(password, "salt", 32)) as Buffer
	}
}

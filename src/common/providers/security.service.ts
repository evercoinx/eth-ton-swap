import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto"
import { promisify } from "util"

@Injectable()
export class SecurityService {
	private readonly initVector = randomBytes(16)
	private readonly encoding = "hex"

	constructor(private readonly configService: ConfigService) {}

	async encryptText(plainText: string): Promise<string> {
		const password = this.configService.get<string>("database.secret")
		const key = await this.generateCypherKey(password)
		const cipher = createCipheriv("aes-256-ctr", key, this.initVector)

		const buffer = Buffer.concat([cipher.update(plainText), cipher.final()])
		return buffer.toString(this.encoding)
	}

	async decryptText(encryptedText: string): Promise<string> {
		const password = this.configService.get<string>("database.secret")
		const key = await this.generateCypherKey(password)
		const decipher = createDecipheriv("aes-256-ctr", key, this.initVector)

		const buffer = Buffer.concat([
			decipher.update(Buffer.from(encryptedText)),
			decipher.final(),
		])
		return buffer.toString(this.encoding)
	}

	private async generateCypherKey(password: string): Promise<Buffer> {
		return (await promisify(scrypt)(password, "salt", 32)) as Buffer
	}
}

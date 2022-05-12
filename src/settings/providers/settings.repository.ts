import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { CreateSetting } from "../interfaces/create-setting.interface"
import { FindSetting } from "../interfaces/find-setting.interface"
import { UpdateSetting } from "../interfaces/update-setting.interface"
import { Setting } from "../setting.entity"

@Injectable()
export class SettingsRepository {
	constructor(@InjectRepository(Setting) private readonly repository: Repository<Setting>) {}

	async create({ blockchain, decimals, minWalletBalance }: CreateSetting): Promise<Setting> {
		const setting = new Setting()
		setting.blockchain = blockchain
		setting.decimals = decimals
		setting.minWalletBalance = minWalletBalance.toFixed(decimals)

		return this.repository.save(setting)
	}

	async update(id: string, { decimals, gasFee }: UpdateSetting): Promise<void> {
		const partialSetting: QueryDeepPartialEntity<Setting> = {}
		partialSetting.gasFee = gasFee.toFixed(decimals)

		await this.repository.update(id, partialSetting)
	}

	async findAll(): Promise<Setting[]> {
		return this.repository.find()
	}

	async findOne({ blockchain }: FindSetting): Promise<Setting | null> {
		return this.repository.findOneBy({ blockchain })
	}
}

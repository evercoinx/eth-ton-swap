import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { CreateSettingDto } from "../dto/create-setting.dto"
import { UpdateSettingDto } from "../dto/update-settings.dto"
import { FindSetting } from "../interfaces/find-setting.interface"
import { Setting } from "../setting.entity"

@Injectable()
export class SettingsRepository {
	constructor(@InjectRepository(Setting) private readonly repository: Repository<Setting>) {}

	async create({ blockchain, decimals, minWalletBalance }: CreateSettingDto): Promise<Setting> {
		const setting = new Setting()
		setting.blockchain = blockchain
		setting.decimals = decimals
		setting.minWalletBalance = minWalletBalance

		return this.repository.save(setting)
	}

	async update(id: string, { gasFee }: UpdateSettingDto): Promise<void> {
		const partialSetting: QueryDeepPartialEntity<Setting> = {}
		if (gasFee !== undefined) {
			partialSetting.gasFee = gasFee
		}

		await this.repository.update(id, partialSetting)
	}

	async findAll(): Promise<Setting[]> {
		return this.repository.find()
	}

	async findOne({ blockchain }: FindSetting): Promise<Setting | null> {
		return this.repository.findOneBy({ blockchain })
	}
}

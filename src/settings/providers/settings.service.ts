import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { CreateSettingDto } from "../dto/create-setting.dto"
import { UpdateSettingDto } from "../dto/update-settings.dto"
import { Setting } from "../setting.entity"

@Injectable()
export class SettingsService {
	constructor(
		@InjectRepository(Setting) private readonly settingRepository: Repository<Setting>,
	) {}

	async create(createSettingDto: CreateSettingDto): Promise<Setting> {
		const setting = new Setting()
		setting.blockchain = createSettingDto.blockchain
		setting.decimals = createSettingDto.decimals
		setting.minWalletBalance = createSettingDto.minWalletBalance
		return this.settingRepository.save(setting)
	}

	async update(id: string, updateSettingDto: UpdateSettingDto): Promise<void> {
		const partialSetting: QueryDeepPartialEntity<Setting> = {}
		if (updateSettingDto.gasFee !== undefined) {
			partialSetting.gasFee = updateSettingDto.gasFee
		}

		await this.settingRepository.update(id, partialSetting)
	}

	async findAll(): Promise<Setting[]> {
		return this.settingRepository.find()
	}

	async findOne(blockchain: Blockchain): Promise<Setting | null> {
		return this.settingRepository.findOneBy({ blockchain })
	}
}

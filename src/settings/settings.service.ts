import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain } from "src/tokens/token.entity"
import { UpdateSettingDto } from "./dto/update-settings.dto"
import { Setting } from "./setting.entity"
import { CreateSettingDto } from "./dto/create-setting.dto"

@Injectable()
export class SettingsService {
	constructor(
		@InjectRepository(Setting) private readonly settingRepository: Repository<Setting>,
	) {}

	async create(createSettingDto: CreateSettingDto): Promise<Setting> {
		const setting = new Setting()
		setting.blockchain = createSettingDto.blockchain
		setting.currencyDecimals = createSettingDto.currencyDecimals
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

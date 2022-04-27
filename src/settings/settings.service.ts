import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain } from "src/tokens/token.entity"
import { UpdateSettingsDto } from "./dto/update-settings.dto"
import { Setting } from "./setting.entity"

@Injectable()
export class SettingsService {
	constructor(
		@InjectRepository(Setting) private readonly settingRepository: Repository<Setting>,
	) {}

	async update(id: string, updateSettingDto: UpdateSettingsDto): Promise<void> {
		const partialSetting: QueryDeepPartialEntity<Setting> = {}
		if (updateSettingDto.gasFee !== undefined) {
			partialSetting.gasFee = updateSettingDto.gasFee
		}
		if (updateSettingDto.minTokenAmount !== undefined) {
			partialSetting.minTokenAmount = updateSettingDto.minTokenAmount
		}
		if (updateSettingDto.maxTokenAmount !== undefined) {
			partialSetting.maxTokenAmount = updateSettingDto.maxTokenAmount
		}

		await this.settingRepository.update(id, partialSetting)
	}

	async findByBlockchain(blockchain: Blockchain): Promise<Setting | null> {
		return this.settingRepository.findOneBy({ blockchain })
	}
}

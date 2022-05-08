import {
	Body,
	CacheInterceptor,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { CreateSettingDto } from "./dto/create-setting.dto"
import { GetSettingsDto } from "./dto/get-settings.dto"
import { SettingsRepository } from "./providers/settings.repository"
import { SyncSettingsGasFeeTask } from "./tasks/sync-settings-gas-fee.task"

@Controller("settings")
@UseInterceptors(CacheInterceptor)
export class SettingsController {
	private readonly logger = new Logger(SettingsController.name)

	constructor(
		private readonly configSerivce: ConfigService,
		private readonly settingsRepository: SettingsRepository,
		private readonly syncSettingsGasFeeTask: SyncSettingsGasFeeTask,
	) {}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post()
	async createSetting(@Body() createSettingDto: CreateSettingDto): Promise<void> {
		const setting = await this.settingsRepository.create(createSettingDto)
		this.logger.log(`Setting for ${setting.blockchain} created`)
	}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("/sync-gas-fee")
	async syncSettingsGasFee(): Promise<void> {
		this.syncSettingsGasFeeTask.runEthereum()
	}

	@Get()
	async getSettings(): Promise<GetSettingsDto> {
		const settingsDto: GetSettingsDto = {
			swapFee: this.configSerivce.get<number>("bridge.swapFee"),
			fees: {},
		}

		const settings = await this.settingsRepository.findAll()
		if (!settings.length) {
			return settingsDto
		}

		for (const setting of settings) {
			const gasFee = new BigNumber(setting.gasFee || 0)
			settingsDto.fees[setting.blockchain] = {
				gasFee: gasFee.toFixed(setting.decimals),
			}
		}

		return settingsDto
	}
}

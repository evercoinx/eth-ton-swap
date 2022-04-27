import {
	Body,
	CacheInterceptor,
	ConflictException,
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
import { TokensService } from "src/tokens/tokens.service"
import { CreateSettingDto } from "./dto/create-setting.dto"
import { GetSettingsDto } from "./dto/get-settings.dto"
import { SettingsService } from "./settings.service"

@Controller("settings")
@UseInterceptors(CacheInterceptor)
export class SettingsController {
	private readonly logger = new Logger(SettingsController.name)

	constructor(
		private readonly configSerivce: ConfigService,
		private readonly settingsService: SettingsService,
		private readonly tokensService: TokensService,
	) {}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post()
	async createSetting(@Body() createSettingDto: CreateSettingDto): Promise<void> {
		const setting = await this.settingsService.findOne(createSettingDto.blockchain)
		if (setting) {
			throw new ConflictException("Setting already exists")
		}

		const newSetting = await this.settingsService.create(createSettingDto)
		this.logger.log(`Setting for ${newSetting.blockchain} created`)
	}

	@Get()
	async getSettings(): Promise<GetSettingsDto> {
		const settingsDto: GetSettingsDto = {
			swapFee: this.configSerivce.get<number>("bridge.swapFee"),
			limits: {},
			fees: {},
		}

		const tokens = await this.tokensService.findAll()
		if (!tokens.length) {
			return settingsDto
		}

		for (const token of tokens) {
			settingsDto.limits[token.id] = {
				minAmount: new BigNumber(token.minSwapAmount).toFixed(token.decimals),
				maxAmount: new BigNumber(token.maxSwapAmount).toFixed(token.decimals),
			}
		}

		const settings = await this.settingsService.findAll()
		if (!settings.length) {
			return settingsDto
		}

		for (const setting of settings) {
			const gasFee = new BigNumber(setting.gasFee || 0)

			settingsDto.fees[setting.blockchain] = {
				gasFee: gasFee.toFixed(setting.currencyDecimals),
			}
		}

		return settingsDto
	}
}

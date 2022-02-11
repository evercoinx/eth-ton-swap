import { Controller, Get } from "@nestjs/common"
import { GetFeesDto } from "./dto/get-fees.dto"
import { FeesService } from "./fees.service"

@Controller("fees")
export class FeesController {
	constructor(private readonly feesService: FeesService) {}

	@Get()
	async findAll(): Promise<GetFeesDto> {
		return this.feesService.findAll()
	}
}

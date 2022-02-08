import { Body, Controller, Get, Param, Post } from "@nestjs/common"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { Swap } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Controller("swaps")
export class SwapsController {
	constructor(private readonly swapsService: SwapsService) {}

	@Post()
	async create(@Body() createSwapDto: CreateSwapDto): Promise<GetSwapDto> {
		const swap = await this.swapsService.create(createSwapDto)
		return this.toGetSwapDto(swap)
	}

	@Get(":id")
	async findOne(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsService.findOne(id)
		return this.toGetSwapDto(swap)
	}

	private toGetSwapDto(swap: Swap): GetSwapDto {
		return {
			id: swap.id,
			sourceBlockchain: swap.sourceBlockchain,
			sourceAddress: swap.sourceAddress,
			sourceAmount: swap.sourceAmount,
			destinationBlockchain: swap.destinationBlockchain,
			destinationAddress: swap.destinationAddress,
			destinationAmount: swap.destinationAmount,
			createdAt: swap.createdAt.getTime(),
			registeredAt: swap.registeredAt.getTime(),
		}
	}
}

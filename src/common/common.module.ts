import { Module } from "@nestjs/common"
import { SWAP_EVENTS_TOKEN } from "./constants"
import { EventsService } from "./providers/events.service"
import { StdlibHelper } from "./providers/stdlib.helper"

@Module({
	providers: [
		{
			provide: SWAP_EVENTS_TOKEN,
			useValue: "swaps",
		},
		EventsService,
		StdlibHelper,
	],
	exports: [
		EventsService,
		StdlibHelper,
		{
			provide: SWAP_EVENTS_TOKEN,
			useValue: "swaps",
		},
	],
})
export class CommonModule {}

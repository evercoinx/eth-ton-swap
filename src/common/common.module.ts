import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { SWAP_EVENTS_TOKEN } from "./constants"
import { EventsService } from "./providers/events.service"
import { SecurityService } from "./providers/security.service"
import { StdlibHelper } from "./providers/stdlib.helper"

@Module({
	imports: [ConfigModule],
	providers: [
		EventsService,
		SecurityService,
		StdlibHelper,
		{
			provide: SWAP_EVENTS_TOKEN,
			useValue: "swaps",
		},
	],
	exports: [
		EventsService,
		SecurityService,
		StdlibHelper,
		{
			provide: SWAP_EVENTS_TOKEN,
			useValue: "swaps",
		},
	],
})
export class CommonModule {}

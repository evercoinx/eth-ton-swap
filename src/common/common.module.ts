import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { SWAP_EVENTS_TOKEN } from "./constants"
import { EventsService } from "./providers/events.service"
import { SecurityService } from "./providers/security.service"
import { StandardHelper } from "./providers/standard.helper"

@Module({
	imports: [ConfigModule],
	providers: [
		EventsService,
		SecurityService,
		StandardHelper,
		{
			provide: SWAP_EVENTS_TOKEN,
			useValue: "swaps",
		},
	],
	exports: [
		EventsService,
		SecurityService,
		StandardHelper,
		{
			provide: SWAP_EVENTS_TOKEN,
			useValue: "swaps",
		},
	],
})
export class CommonModule {}

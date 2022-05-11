import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { SWAPS_EVENT_GROUP } from "./constants"
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
			provide: SWAPS_EVENT_GROUP,
			useValue: "swaps",
		},
	],
	exports: [
		EventsService,
		SecurityService,
		StandardHelper,
		{
			provide: SWAPS_EVENT_GROUP,
			useValue: "swaps",
		},
	],
})
export class CommonModule {}

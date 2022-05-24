import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { EventsService } from "./providers/events.service"
import { SecurityService } from "./providers/security.service"
import { StandardHelper } from "./providers/standard.helper"

@Module({
	imports: [ConfigModule],
	providers: [EventsService, SecurityService, StandardHelper],
	exports: [EventsService, SecurityService, StandardHelper],
})
export class CommonModule {}

import { EventsService } from "src/common/events.service"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"

export class BaseSwapsProcessor {
	constructor(protected readonly eventsService: EventsService) {}

	protected emitEvent(
		swapId: string,
		status: SwapStatus,
		currentConfirmations: number,
		totalConfirmations: number,
	): void {
		this.eventsService.emit({
			id: swapId,
			status,
			currentConfirmations,
			totalConfirmations,
			createdAt: Date.now(),
		} as SwapEvent)
	}

	protected isSwapProcessable(status: SwapStatus): boolean {
		return ![SwapStatus.Failed, SwapStatus.Expired, SwapStatus.Canceled].includes(status)
	}
}

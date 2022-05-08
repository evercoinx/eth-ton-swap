import { EventEmitter } from "events"
import { Inject, Injectable } from "@nestjs/common"
import { filter, fromEvent, Observable } from "rxjs"
import { SWAP_EVENTS_TOKEN } from "../constants"
import { Event } from "../interfaces/event"

@Injectable()
export class EventsService {
	private readonly eventEmitter = new EventEmitter()

	constructor(@Inject(SWAP_EVENTS_TOKEN) private readonly swapEvents: string) {}

	emit(data: any): void {
		this.eventEmitter.emit(this.swapEvents, { data })
	}

	subscribe(id: string): Observable<Event> {
		return fromEvent(this.eventEmitter, this.swapEvents).pipe(
			filter((event: Event) => event.data.id === id),
		)
	}
}

import { Inject, Injectable } from "@nestjs/common"
import { EventEmitter } from "events"
import { filter, fromEvent, Observable } from "rxjs"
import { SWAPS_EVENT_GROUP } from "../constants"
import { Event } from "../interfaces/event"

@Injectable()
export class EventsService {
	private readonly eventEmitter = new EventEmitter()

	constructor(@Inject(SWAPS_EVENT_GROUP) private readonly swapEvents: string) {}

	emit(eventData: any): void {
		for (const propertyName of Object.getOwnPropertyNames(eventData)) {
			if (typeof eventData[propertyName] === "undefined") {
				eventData[propertyName] = null
			}
		}
		this.eventEmitter.emit(this.swapEvents, { data: eventData })
	}

	subscribe(eventId: string): Observable<Event> {
		return fromEvent(this.eventEmitter, this.swapEvents).pipe(
			filter((event: Event) => event.data.id === eventId),
		)
	}
}

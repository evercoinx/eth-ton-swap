import { Injectable } from "@nestjs/common"
import { EventEmitter } from "events"
import { filter, fromEvent, Observable } from "rxjs"
import { Event } from "../interfaces/event.interface"

@Injectable()
export class EventsService {
	private static readonly eventName = "event"
	private readonly eventEmitter = new EventEmitter()

	emit(data: any): void {
		for (const propertyName of Object.getOwnPropertyNames(data)) {
			if (typeof data[propertyName] === "undefined") {
				data[propertyName] = null
			}
		}
		this.eventEmitter.emit(EventsService.eventName, { data })
	}

	subscribe(id: string): Observable<Event> {
		return fromEvent(this.eventEmitter, EventsService.eventName).pipe(
			filter((event: Event) => event.data.id === id),
		)
	}
}

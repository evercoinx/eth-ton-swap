import { EventEmitter } from "events"
import { Inject, Injectable } from "@nestjs/common"
import { filter, fromEvent, Observable } from "rxjs"
import { EVENT_GROUP_NAME } from "../constants"
import { Event } from "../interfaces/event"

@Injectable()
export class EventsService {
	private readonly eventEmitter = new EventEmitter()

	constructor(@Inject(EVENT_GROUP_NAME) private readonly eventGroupName: string) {}

	emit(data: any): void {
		this.eventEmitter.emit(this.eventGroupName, { data })
	}

	subscribe(id: string): Observable<Event> {
		return fromEvent(this.eventEmitter, this.eventGroupName).pipe(
			filter((event: Event) => event.data.id === id),
		)
	}
}

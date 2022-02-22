import { EventEmitter } from "events"
import { Inject, Injectable } from "@nestjs/common"
import { fromEvent, Observable } from "rxjs"
import { EVENT_GROUP_NAME } from "./constants"

@Injectable()
export class EventsService {
	private readonly emitter = new EventEmitter()

	constructor(@Inject(EVENT_GROUP_NAME) private eventGroupName: string) {}

	emit(data: any): void {
		this.emitter.emit(this.eventGroupName, { data })
	}

	subscribe(): Observable<any> {
		return fromEvent(this.emitter, this.eventGroupName)
	}
}

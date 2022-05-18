import * as TraceAgent from "@google-cloud/trace-agent"
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common"
import { Observable } from "rxjs"
import { tap } from "rxjs/operators"

@Injectable()
export class TracerInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const rootSpan = TraceAgent.get().getCurrentRootSpan()
		return next.handle().pipe(tap(() => rootSpan.endSpan()))
	}
}

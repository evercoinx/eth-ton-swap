export enum SwapStatus {
	Pending = "pending",
	Confirmed = "confirmed",
	Completed = "completed",
	Expired = "expired",
	Failed = "failed",
	Canceled = "canceled",
}

export function getAllSwapStatuses(): SwapStatus[] {
	return [
		SwapStatus.Pending,
		SwapStatus.Confirmed,
		SwapStatus.Completed,
		SwapStatus.Expired,
		SwapStatus.Failed,
		SwapStatus.Canceled,
	]
}

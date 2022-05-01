export enum SwapStatus {
	Pending = "pending",
	Confirmed = "confirmed",
	Completed = "completed",
	Expired = "expired",
	Failed = "failed",
	Canceled = "canceled",
}

export function getAllSwapStatuses() {
	return [
		SwapStatus.Pending,
		SwapStatus.Confirmed,
		SwapStatus.Completed,
		SwapStatus.Expired,
		SwapStatus.Failed,
		SwapStatus.Canceled,
	]
}

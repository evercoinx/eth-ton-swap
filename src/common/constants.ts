export const SWAP_EVENTS_TOKEN = "SWAP_EVENTS_TOKEN"

export const QUEUE_HIGH_PRIORITY = 1
export const QUEUE_MEDIUM_PRIORITY = 2
export const QUEUE_LOW_PRIORITY = 3

export const ATTEMPT_COUNT_NORMAL = (20 * 60) / 4
export const ATTEMPT_COUNT_EXTENDED = 3 * ATTEMPT_COUNT_NORMAL
export const ATTEMPT_COUNT_ULTIMATE = 12 * ATTEMPT_COUNT_NORMAL

export const ERROR_MESSAGE_TO_STATUS_CODE = {
	"No error": 0,
	"Swap expired": 1,
	"Swap not recalculated: Zero amount": 2,
	"Swap not recalculated: Amount too low": 3,
	"Swap not recalculated: Amount too high": 4,
	"Swap not recalculated: Zero fee": 5,
	"Admin wallet of jetton minter not found": 6,
	"Swap not found": 1000,
	"Source token not found": 1001,
	"Destination token not found": 1002,
	"Invalid address format": 1003,
	"Swap amount too low": 1004,
	"Swap amount too high": 1005,
	"Too many requests": 1006,
	"Source wallet not available": 1007,
	"Destination wallet not available": 1008,
	"Collector wallet not available": 1009,
	"Blockchain connection lost": 1010,
	"Blockchain not supported": 1011,
	"Swap already completed": 1012,
	"Swap in progress": 1013,
}

export const EVENT_GROUP_NAME = "EVENT_GROUP_NAME"

export const QUEUE_HIGH_PRIORITY = 1
export const QUEUE_MEDIUM_PRIORITY = 2
export const QUEUE_LOW_PRIORITY = 3

export const ATTEMPT_COUNT_NORMAL = (20 * 60) / 4
export const ATTEMPT_COUNT_EXTENDED = 3 * ATTEMPT_COUNT_NORMAL
export const ATTEMPT_COUNT_ULTIMATE = 12 * ATTEMPT_COUNT_NORMAL

export const ERROR_MESSAGE_TO_STATUS_CODE = {
	"No error": 0,
	"Swap expired": 1,
	"Swap not found": 2,
	"Swap not recalculated: Zero amount": 3,
	"Swap not recalculated: Amount too low": 4,
	"Swap not recalculated: Amount too high": 5,
	"Swap not recalculated: Zero fee": 6,
	"Admin wallet of jetton minter not found": 7,
	"Source token not found": 1000,
	"Destination token not found": 1001,
	"Invalid address format": 1002,
	"Swap amount too low": 1003,
	"Swap amount too high": 1004,
	"Too many requests": 1005,
	"Source wallet not available": 1006,
	"Destination wallet not available": 1007,
	"Collector wallet not available": 1008,
	"Blockchain connection lost": 1009,
	"Blockchain not supported": 1010,
	"Swap already completed": 1011,
	"Swap in progress": 1012,
}

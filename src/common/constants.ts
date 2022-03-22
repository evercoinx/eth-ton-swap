export const EVENT_GROUP_NAME = "EVENT_GROUP_NAME"

export const ERC20_TOKEN_CONTRACT_ABI = [
	"function balanceOf(address owner) view returns (uint256)",
	"function transfer(address to, uint amount) returns (bool)",
	"event Transfer(address indexed from, address indexed to, uint amount)",
]

export const ERC20_TOKEN_TRANSFER_GAS_LIMIT = 100000

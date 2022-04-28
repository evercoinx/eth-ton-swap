export const ERC20_TOKEN_CONTRACT_ABI = [
	"function balanceOf(address owner) view returns (uint256)",
	"function transfer(address to, uint amount) returns (bool)",
	"event Transfer(address indexed from, address indexed to, uint amount)",
]

export const ERC20_TOKEN_TRANSFER_GAS_LIMIT = 100000

export const ETH_BLOCK_TRACKING_INTERVAL = 4000

export const ETH_CACHE_TTL = (ETH_BLOCK_TRACKING_INTERVAL * 10) / 1000 // in seconds

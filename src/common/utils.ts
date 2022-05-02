export function capitalize(word: string) {
	return `${word[0].toUpperCase()}${word.slice(1)}`
}

export function sleep(ms: number): Promise<unknown> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

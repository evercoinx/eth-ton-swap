export class BaseValidationPipe {
	protected validateMetaType(metatype: any): boolean {
		// eslint-disable-next-line @typescript-eslint/ban-types
		const types: Function[] = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}

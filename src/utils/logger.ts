export type LogLevel = 'silent' | 'info' | 'debug';

const level: LogLevel = 'debug';

function shouldLog(target: LogLevel): boolean {
	if (level === 'silent') return false;
	if (level === 'info') return target === 'info';
	return true;
}

export const logger = {
	info(message: string, data?: unknown): void {
		if (!shouldLog('info')) return;

		if (data) {
			console.info(`[planet] ${message}`, data);
		} else {
			console.info(`[planet] ${message}`);
		}
	},

	debug(message: string, data?: unknown): void {
		if (!shouldLog('debug')) return;

		if (data) {
			console.debug(`[planet] ${message}`, data);
		} else {
			console.debug(`[planet] ${message}`);
		}
	},
};

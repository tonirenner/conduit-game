export type JsonResponseInit = {
	status?: number;
	headers?: HeadersInit;
};

export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export function json(data: unknown, init: JsonResponseInit = {}): Response {
	return Response.json(data, {
		status: init.status ?? 200,
		headers: init.headers,
	});
}

export function fail(status: number, message: string): never {
	throw new HttpError(status, message);
}

export function readCookie(request: Request, name: string): string | null {
	const cookie = request.headers.get('cookie');

	if (!cookie) {
		return null;
	}

	for (const part of cookie.split(';')) {
		const [key, ...valueParts] = part.trim().split('=');

		if (key === name) {
			return decodeURIComponent(valueParts.join('='));
		}
	}

	return null;
}

export function sessionCookie(value: string, expiresAt: string): string {
	return [
		`conduit_session=${encodeURIComponent(value)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Expires=${new Date(expiresAt).toUTCString()}`,
	].join('; ');
}

export function clearSessionCookie(): string {
	return [
		'conduit_session=',
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
	].join('; ');
}


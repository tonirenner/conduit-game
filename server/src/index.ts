import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';

import {
	type DbMediaItem,
	type DbSession,
	type DbUser,
	openAppDatabase,
} from './db';
import {
	HttpError,
	clearSessionCookie,
	fail,
	json,
	readCookie,
	sessionCookie,
} from './http';

type SessionUser = Pick<
	DbUser,
	'id' | 'email' | 'display_name' | 'role' | 'early_access_enabled'
>;

type RegisterBody = {
	email?: string;
	password?: string;
	displayName?: string;
};

type LoginBody = {
	email?: string;
	password?: string;
};

type ProfileUpdateBody = {
	displayName?: string;
	profile?: Record<string, unknown>;
};

type MediaUpdateBody = {
	type?: 'image' | 'video';
	title?: string;
	description?: string;
	url?: string;
	thumbnailUrl?: string | null;
	sortOrder?: number;
	published?: boolean;
};

const db = openAppDatabase();
const frontendDir = resolve('src/frontend');
const publicDir = resolve('public');
const uploadDir = resolve('public/uploads');
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;
const serverPort = Number(process.env.PORT ?? 8787);
const gameLaunchUrl = process.env.CONDUIT_GAME_URL ?? 'http://localhost:3000/';

await mkdir(uploadDir, { recursive: true });
seedDefaultMedia();

const server = Bun.serve({
	port: serverPort,
	async fetch(request) {
		try {
			const url = new URL(request.url);

			if (url.pathname.startsWith('/api/')) {
				return await handleApi(request, url);
			}

			return await serveStatic(url);
		} catch (error) {
			if (error instanceof HttpError) {
				return json({ error: error.message }, { status: error.status });
			}

			console.error('[server] unhandled request error', error);

			return json({ error: 'Internal server error' }, { status: 500 });
		}
	},
});

console.info(`[server] Conduit Early Access server listening on http://localhost:${server.port}`);

async function handleApi(request: Request, url: URL): Promise<Response> {
	const { pathname } = url;

	if (request.method === 'GET' && pathname === '/api/health') {
		return json({ ok: true, service: 'conduit-server' });
	}

	if (request.method === 'POST' && pathname === '/api/auth/register') {
		return register(request);
	}

	if (request.method === 'POST' && pathname === '/api/auth/login') {
		return login(request);
	}

	if (request.method === 'POST' && pathname === '/api/auth/logout') {
		return logout();
	}

	if (request.method === 'GET' && pathname === '/api/session') {
		return getSession(request);
	}

	if (request.method === 'GET' && pathname === '/api/player/profile') {
		const user = requireUser(request);

		return json({ user, profile: loadProfile(user.id) });
	}

	if (request.method === 'PUT' && pathname === '/api/player/profile') {
		const user = requireUser(request);

		return updateProfile(request, user);
	}

	if (request.method === 'GET' && pathname === '/api/savegame') {
		const user = requireUser(request);

		return json({ saveGame: loadSaveGame(user.id) });
	}

	if (request.method === 'PUT' && pathname === '/api/savegame') {
		const user = requireUser(request);
		const body = await readJson<Record<string, unknown>>(request);
		const now = new Date().toISOString();
		const saveVersion = Number(body.saveVersion ?? 1);

		db.query(`
			INSERT INTO save_games (user_id, save_json, save_version, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(user_id) DO UPDATE SET
				save_json = excluded.save_json,
				save_version = excluded.save_version,
				updated_at = excluded.updated_at
		`).run(user.id, JSON.stringify(body), saveVersion, now);

		return json({ saveGame: body });
	}

	if (request.method === 'GET' && pathname === '/api/media') {
		const includeDrafts = url.searchParams.get('drafts') === '1';

		if (includeDrafts) {
			requireAdmin(request);
		}

		return json({ items: listMediaItems(includeDrafts) });
	}

	if (request.method === 'POST' && pathname === '/api/admin/media') {
		requireAdmin(request);

		return createMediaItem(request);
	}

	if (request.method === 'POST' && pathname === '/api/admin/uploads') {
		requireAdmin(request);

		return uploadMedia(request);
	}

	const mediaMatch = pathname.match(/^\/api\/admin\/media\/([^/]+)$/);

	if (mediaMatch && request.method === 'PUT') {
		requireAdmin(request);

		return updateMediaItem(mediaMatch[1], request);
	}

	if (mediaMatch && request.method === 'DELETE') {
		requireAdmin(request);
		db.query('DELETE FROM media_items WHERE id = ?').run(mediaMatch[1]);

		return json({ ok: true });
	}

	return json({ error: 'Not found' }, { status: 404 });
}

async function register(request: Request): Promise<Response> {
	const body = await readJson<RegisterBody>(request);
	const email = normalizeEmail(body.email);
	const password = body.password?.trim() ?? '';
	const displayName = body.displayName?.trim() || 'Commander';

	if (!email) {
		fail(400, 'Valid email required');
	}

	if (password.length < 8) {
		fail(400, 'Password must be at least 8 characters');
	}

	const now = new Date().toISOString();
	const userId = crypto.randomUUID();
	const passwordHash = await Bun.password.hash(password);

	try {
		db.query(`
			INSERT INTO users (
				id,
				email,
				password_hash,
				display_name,
				role,
				created_at,
				early_access_enabled
			)
			VALUES (?, ?, ?, ?, ?, ?, 1)
		`).run(userId, email, passwordHash, displayName, 'player', now);
	} catch (error) {
		if (error instanceof Error && error.message.includes('UNIQUE')) {
			fail(409, 'Email already registered');
		}

		throw error;
	}

	saveProfile(userId, createDefaultProfile(userId, displayName));

	return createSessionResponse(loadUserById(userId)!, 201);
}

async function login(request: Request): Promise<Response> {
	const body = await readJson<LoginBody>(request);
	const email = normalizeEmail(body.email);
	const password = body.password?.trim() ?? '';

	if (!email || !password) {
		fail(400, 'Email and password required');
	}

	const user = db.query<DbUser, [string]>('SELECT * FROM users WHERE email = ?').get(email);

	if (!user || !(await Bun.password.verify(password, user.password_hash))) {
		fail(401, 'Invalid credentials');
	}

	db.query('UPDATE users SET last_login_at = ? WHERE id = ?')
		.run(new Date().toISOString(), user.id);

	return createSessionResponse(loadUserById(user.id)!);
}

function logout(): Response {
	return json(
		{ ok: true },
		{ headers: { 'Set-Cookie': clearSessionCookie() } },
	);
}

function getSession(request: Request): Response {
	const user = getSessionUser(request);

	return json({
		authenticated: Boolean(user),
		user,
		profile: user ? loadProfile(user.id) : null,
	});
}

async function updateProfile(
	request: Request,
	user: SessionUser,
): Promise<Response> {
	const body = await readJson<ProfileUpdateBody>(request);
	const current = loadProfile(user.id);
	const nextDisplayName =
		body.displayName?.trim() ||
		String(current.displayName ?? user.display_name);
	const nextProfile = {
		...current,
		...(body.profile ?? {}),
		id: user.id,
		displayName: nextDisplayName,
		updatedAt: new Date().toISOString(),
	};

	db.query('UPDATE users SET display_name = ? WHERE id = ?')
		.run(nextDisplayName, user.id);
	saveProfile(user.id, nextProfile);

	return json({
		user: loadPublicUser(loadUserById(user.id)!),
		profile: nextProfile,
	});
}

async function createMediaItem(request: Request): Promise<Response> {
	const body = await readJson<MediaUpdateBody>(request);
	const now = new Date().toISOString();
	const item = normalizeMediaInput(body, {
		id: crypto.randomUUID(),
		createdAt: now,
		updatedAt: now,
	});

	db.query(`
		INSERT INTO media_items (
			id,
			type,
			title,
			description,
			url,
			thumbnail_url,
			sort_order,
			published,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		item.id,
		item.type,
		item.title,
		item.description,
		item.url,
		item.thumbnailUrl,
		item.sortOrder,
		item.published ? 1 : 0,
		item.createdAt,
		item.updatedAt,
	);

	return json({ item }, { status: 201 });
}

async function updateMediaItem(
	id: string,
	request: Request,
): Promise<Response> {
	const existing = db.query<DbMediaItem, [string]>('SELECT * FROM media_items WHERE id = ?').get(id);

	if (!existing) {
		fail(404, 'Media item not found');
	}

	const body = await readJson<MediaUpdateBody>(request);
	const item = normalizeMediaInput(
		{
			type: body.type ?? existing.type,
			title: body.title ?? existing.title,
			description: body.description ?? existing.description,
			url: body.url ?? existing.url,
			thumbnailUrl: body.thumbnailUrl ?? existing.thumbnail_url,
			sortOrder: body.sortOrder ?? existing.sort_order,
			published: body.published ?? Boolean(existing.published),
		},
		{
			id,
			createdAt: existing.created_at,
			updatedAt: new Date().toISOString(),
		},
	);

	db.query(`
		UPDATE media_items SET
			type = ?,
			title = ?,
			description = ?,
			url = ?,
			thumbnail_url = ?,
			sort_order = ?,
			published = ?,
			updated_at = ?
		WHERE id = ?
	`).run(
		item.type,
		item.title,
		item.description,
		item.url,
		item.thumbnailUrl,
		item.sortOrder,
		item.published ? 1 : 0,
		item.updatedAt,
		id,
	);

	return json({ item });
}

async function uploadMedia(request: Request): Promise<Response> {
	const form = await request.formData();
	const file = form.get('file');

	if (!(file instanceof File)) {
		fail(400, 'Upload file required');
	}

	if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
		fail(400, 'Only image and video uploads are supported');
	}

	const extension = extname(file.name).toLowerCase() || mediaExtension(file.type);
	const fileName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
	const target = join(uploadDir, fileName);

	await writeFile(target, new Uint8Array(await file.arrayBuffer()));

	return json({
		url: `/uploads/${fileName}`,
		type: file.type.startsWith('video/') ? 'video' : 'image',
	});
}

function createSessionResponse(user: DbUser, status = 200): Response {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + sessionTtlMs).toISOString();
	const sessionId = crypto.randomUUID();

	db.query(`
		INSERT INTO sessions (id, user_id, created_at, expires_at)
		VALUES (?, ?, ?, ?)
	`).run(sessionId, user.id, now.toISOString(), expiresAt);

	return json(
		{
			user: loadPublicUser(user),
			profile: loadProfile(user.id),
		},
		{
			status,
			headers: { 'Set-Cookie': sessionCookie(sessionId, expiresAt) },
		},
	);
}

function getSessionUser(request: Request): SessionUser | null {
	const sessionId = readCookie(request, 'conduit_session');

	if (!sessionId) {
		return null;
	}

	const row = db.query<DbSession & DbUser, [string]>(`
		SELECT
			sessions.id,
			sessions.user_id,
			sessions.created_at,
			sessions.expires_at,
			users.email,
			users.display_name,
			users.role,
			users.early_access_enabled,
			users.password_hash,
			users.last_login_at
		FROM sessions
		JOIN users ON users.id = sessions.user_id
		WHERE sessions.id = ?
	`).get(sessionId);

	if (!row) {
		return null;
	}

	if (new Date(row.expires_at).getTime() <= Date.now()) {
		db.query('DELETE FROM sessions WHERE id = ?').run(sessionId);

		return null;
	}

	return loadPublicUser({
		id: row.user_id,
		email: row.email,
		password_hash: row.password_hash,
		display_name: row.display_name,
		role: row.role,
		created_at: row.created_at,
		last_login_at: row.last_login_at,
		early_access_enabled: row.early_access_enabled,
	});
}

function requireUser(request: Request): SessionUser {
	const user = getSessionUser(request);

	if (!user) {
		fail(401, 'Authentication required');
	}

	return user;
}

function requireAdmin(request: Request): SessionUser {
	const user = requireUser(request);

	if (user.role !== 'admin') {
		fail(403, 'Admin access required');
	}

	return user;
}

function loadUserById(id: string): DbUser | null {
	return db.query<DbUser, [string]>('SELECT * FROM users WHERE id = ?').get(id) ?? null;
}

function loadPublicUser(user: DbUser): SessionUser {
	return {
		id: user.id,
		email: user.email,
		display_name: user.display_name,
		role: user.role,
		early_access_enabled: user.early_access_enabled,
	};
}

function loadProfile(userId: string): Record<string, unknown> {
	const row = db.query<{ profile_json: string }, [string]>(
		'SELECT profile_json FROM player_profiles WHERE user_id = ?',
	).get(userId);

	if (!row) {
		const user = loadUserById(userId);
		const profile = createDefaultProfile(
			userId,
			user?.display_name ?? 'Commander',
		);

		saveProfile(userId, profile);

		return profile;
	}

	return JSON.parse(row.profile_json) as Record<string, unknown>;
}

function saveProfile(userId: string, profile: Record<string, unknown>): void {
	db.query(`
		INSERT INTO player_profiles (user_id, profile_json, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			profile_json = excluded.profile_json,
			updated_at = excluded.updated_at
	`).run(userId, JSON.stringify(profile), new Date().toISOString());
}

function loadSaveGame(userId: string): Record<string, unknown> | null {
	const row = db.query<{ save_json: string }, [string]>(
		'SELECT save_json FROM save_games WHERE user_id = ?',
	).get(userId);

	return row ? JSON.parse(row.save_json) as Record<string, unknown> : null;
}

function createDefaultProfile(
	userId: string,
	displayName: string,
): Record<string, unknown> {
	const now = new Date().toISOString();

	return {
		id: userId,
		displayName,
		createdAt: now,
		research: {
			completed: [],
			active: null,
			progress: {},
		},
		resources: {
			credits: 15000,
			metal: 2500,
			rareMaterials: 250,
			fuel: 1200,
			researchPoints: 0,
		},
		ownedSystems: [],
		fleets: [],
		unlockedShips: ['fighter', 'frigate', 'capital_ship'],
		storyProgress: {
			activeMissions: [],
			completedMissions: [],
		},
	};
}

function listMediaItems(includeDrafts: boolean): Array<Record<string, unknown>> {
	const sql = includeDrafts
		? 'SELECT * FROM media_items ORDER BY sort_order ASC, created_at DESC'
		: 'SELECT * FROM media_items WHERE published = 1 ORDER BY sort_order ASC, created_at DESC';

	return db.query<DbMediaItem, []>(sql).all().map(mapMediaItem);
}

function normalizeMediaInput(
	body: MediaUpdateBody,
	meta: { id: string; createdAt: string; updatedAt: string },
): Record<string, unknown> {
	const type = body.type === 'video' ? 'video' : 'image';
	const title = body.title?.trim();
	const url = body.url?.trim();

	if (!title) {
		fail(400, 'Media title required');
	}

	if (!url) {
		fail(400, 'Media URL required');
	}

	return {
		id: meta.id,
		type,
		title,
		description: body.description?.trim() ?? '',
		url,
		thumbnailUrl: body.thumbnailUrl?.trim() || null,
		sortOrder: Number(body.sortOrder ?? 0),
		published: body.published !== false,
		createdAt: meta.createdAt,
		updatedAt: meta.updatedAt,
	};
}

function mapMediaItem(item: DbMediaItem): Record<string, unknown> {
	return {
		id: item.id,
		type: item.type,
		title: item.title,
		description: item.description,
		url: item.url,
		thumbnailUrl: item.thumbnail_url,
		sortOrder: item.sort_order,
		published: Boolean(item.published),
		createdAt: item.created_at,
		updatedAt: item.updated_at,
	};
}

function seedDefaultMedia(): void {
	const row = db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM media_items').get();

	if (row && row.count > 0) {
		return;
	}

	const now = new Date().toISOString();
	const items = [
		{
			id: crypto.randomUUID(),
			type: 'image',
			title: 'Earth 3030',
			description: 'Recovered Earth and orbital expansion baseline.',
			url: '/assets/earth.jpg',
			sortOrder: 10,
		},
		{
			id: crypto.randomUUID(),
			type: 'image',
			title: 'Wormhole Transit',
			description: 'Strategic geography of the wormhole network.',
			url: '/assets/wormhole.jpg',
			sortOrder: 20,
		},
		{
			id: crypto.randomUUID(),
			type: 'image',
			title: 'System Progression',
			description: 'From first contact to stable civilization node.',
			url: '/assets/progression.jpg',
			sortOrder: 30,
		},
	];

	const insert = db.query(`
		INSERT INTO media_items (
			id,
			type,
			title,
			description,
			url,
			sort_order,
			published,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
	`);

	for (const item of items) {
		insert.run(
			item.id,
			item.type,
			item.title,
			item.description,
			item.url,
			item.sortOrder,
			now,
			now,
		);
	}
}

async function readJson<T>(request: Request): Promise<T> {
	try {
		return await request.json() as T;
	} catch {
		fail(400, 'Invalid JSON body');
	}
}

function normalizeEmail(email: string | undefined): string {
	const normalized = email?.trim().toLowerCase() ?? '';

	return normalized.includes('@') ? normalized : '';
}

async function serveStatic(url: URL): Promise<Response> {
	if (url.pathname === '/game' || url.pathname === '/game/') {
		return Response.redirect(gameLaunchUrl, 302);
	}

	if (url.pathname === '/' || url.pathname === '/index.html') {
		return serveFile(join(frontendDir, 'index.html'));
	}

	const frontendAsset = resolveSafe(frontendDir, url.pathname.slice(1));

	if (frontendAsset) {
		const response = await tryServeFile(frontendAsset);

		if (response) {
			return response;
		}
	}

	const publicAsset = resolveSafe(publicDir, url.pathname.slice(1));

	if (publicAsset) {
		const response = await tryServeFile(publicAsset);

		if (response) {
			return response;
		}
	}

	return new Response('Not found', { status: 404 });
}

async function tryServeFile(path: string): Promise<Response | null> {
	const file = Bun.file(path);

	if (!(await file.exists())) {
		return null;
	}

	return new Response(file, {
		headers: {
			'Content-Type': contentType(path),
		},
	});
}

async function serveFile(path: string): Promise<Response> {
	const response = await tryServeFile(path);

	return response ?? new Response('Not found', { status: 404 });
}

function resolveSafe(baseDir: string, relativePath: string): string | null {
	const cleaned = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
	const resolved = resolve(baseDir, cleaned);

	return resolved.startsWith(baseDir) ? resolved : null;
}

function contentType(path: string): string {
	const extension = extname(path).toLowerCase();

	switch (extension) {
		case '.html':
			return 'text/html; charset=utf-8';
		case '.css':
			return 'text/css; charset=utf-8';
		case '.js':
		case '.ts':
			return 'text/javascript; charset=utf-8';
		case '.json':
			return 'application/json; charset=utf-8';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.webp':
			return 'image/webp';
		case '.mp4':
			return 'video/mp4';
		case '.webm':
			return 'video/webm';
		case '.glb':
			return 'model/gltf-binary';
		case '.exr':
			return 'image/aces';
		default:
			return 'application/octet-stream';
	}
}

function mediaExtension(type: string): string {
	switch (type) {
		case 'image/png':
			return '.png';
		case 'image/webp':
			return '.webp';
		case 'video/mp4':
			return '.mp4';
		case 'video/webm':
			return '.webm';
		default:
			return '.jpg';
	}
}

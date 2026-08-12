import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type DbUser = {
	id: string;
	email: string;
	password_hash: string;
	display_name: string;
	role: 'admin' | 'player';
	created_at: string;
	last_login_at: string | null;
	early_access_enabled: number;
};

export type DbSession = {
	id: string;
	user_id: string;
	created_at: string;
	expires_at: string;
};

export type DbMediaItem = {
	id: string;
	type: 'image' | 'video';
	title: string;
	description: string;
	url: string;
	thumbnail_url: string | null;
	sort_order: number;
	published: number;
	created_at: string;
	updated_at: string;
};

const DEFAULT_DB_PATH = 'data/conduit.sqlite';

export function openAppDatabase(path = process.env.CONDUIT_DB_PATH ?? DEFAULT_DB_PATH): Database {
	const resolvedPath = resolve(path);

	mkdirSync(dirname(resolvedPath), { recursive: true });

	const db = new Database(resolvedPath);

	db.exec('PRAGMA foreign_keys = ON');
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA busy_timeout = 5000');
	ensureSchema(db);

	return db;
}

function ensureSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'player',
			created_at TEXT NOT NULL,
			last_login_at TEXT,
			early_access_enabled INTEGER NOT NULL DEFAULT 1
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS player_profiles (
			user_id TEXT PRIMARY KEY,
			profile_json TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS save_games (
			user_id TEXT PRIMARY KEY,
			save_json TEXT NOT NULL,
			save_version INTEGER NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS media_items (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			url TEXT NOT NULL,
			thumbnail_url TEXT,
			sort_order INTEGER NOT NULL DEFAULT 0,
			published INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`);
}

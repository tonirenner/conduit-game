import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type ServerConfig = {
	server: {
		host: string;
		port: number;
		publicBaseUrl: string;
	};
	game: {
		host: string;
		port: number;
		launchUrl: string;
	};
	storage: {
		databasePath: string;
		uploadDir: string;
		uploadPublicPath: string;
	};
	frontend: {
		dir: string;
		publicDir: string;
	};
	auth: {
		registrationEnabled: boolean;
		sessionDays: number;
	};
	cms: {
		seedDefaultMedia: boolean;
		maxUploadBytes: number;
	};
};

const DEFAULT_CONFIG: ServerConfig = {
	server: {
		host: '0.0.0.0',
		port: 8787,
		publicBaseUrl: 'http://localhost:8787',
	},
	game: {
		host: '0.0.0.0',
		port: 3000,
		launchUrl: 'http://localhost:3000/',
	},
	storage: {
		databasePath: 'data/conduit.sqlite',
		uploadDir: 'public/uploads',
		uploadPublicPath: '/uploads',
	},
	frontend: {
		dir: 'src/frontend',
		publicDir: 'public',
	},
	auth: {
		registrationEnabled: true,
		sessionDays: 14,
	},
	cms: {
		seedDefaultMedia: true,
		maxUploadBytes: 100 * 1024 * 1024,
	},
};

export async function loadServerConfig(): Promise<ServerConfig> {
	const configPath = resolve(process.env.CONDUIT_CONFIG ?? 'config/server.config.json');
	const fileConfig = existsSync(configPath)
		? await readConfigFile(configPath)
		: {};
	const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);

	applyEnvironmentOverrides(merged);
	normalizeConfig(merged);

	return merged;
}

async function readConfigFile(path: string): Promise<PartialDeep<ServerConfig>> {
	const text = await Bun.file(path).text();

	return JSON.parse(text) as PartialDeep<ServerConfig>;
}

function mergeConfig(
	base: ServerConfig,
	override: PartialDeep<ServerConfig>,
): ServerConfig {
	return {
		server: {
			...base.server,
			...override.server,
		},
		game: {
			...base.game,
			...override.game,
		},
		storage: {
			...base.storage,
			...override.storage,
		},
		frontend: {
			...base.frontend,
			...override.frontend,
		},
		auth: {
			...base.auth,
			...override.auth,
		},
		cms: {
			...base.cms,
			...override.cms,
		},
	};
}

function applyEnvironmentOverrides(config: ServerConfig): void {
	if (process.env.HOST) {
		config.server.host = process.env.HOST;
	}

	if (process.env.PORT) {
		config.server.port = Number(process.env.PORT);
	}

	if (process.env.CONDUIT_PUBLIC_BASE_URL) {
		config.server.publicBaseUrl = process.env.CONDUIT_PUBLIC_BASE_URL;
	}

	if (process.env.CONDUIT_GAME_URL) {
		config.game.launchUrl = process.env.CONDUIT_GAME_URL;
	}

	if (process.env.CONDUIT_GAME_HOST) {
		config.game.host = process.env.CONDUIT_GAME_HOST;
	}

	if (process.env.CONDUIT_GAME_PORT) {
		config.game.port = Number(process.env.CONDUIT_GAME_PORT);
	}

	if (process.env.CONDUIT_DB_PATH) {
		config.storage.databasePath = process.env.CONDUIT_DB_PATH;
	}

	if (process.env.CONDUIT_UPLOAD_DIR) {
		config.storage.uploadDir = process.env.CONDUIT_UPLOAD_DIR;
	}
}

function normalizeConfig(config: ServerConfig): void {
	config.server.port = toPositiveInteger(config.server.port, DEFAULT_CONFIG.server.port);
	config.game.port = toPositiveInteger(config.game.port, DEFAULT_CONFIG.game.port);
	config.auth.sessionDays = toPositiveInteger(
		config.auth.sessionDays,
		DEFAULT_CONFIG.auth.sessionDays,
	);
	config.cms.maxUploadBytes = toPositiveInteger(
		config.cms.maxUploadBytes,
		DEFAULT_CONFIG.cms.maxUploadBytes,
	);

	if (!config.storage.uploadPublicPath.startsWith('/')) {
		config.storage.uploadPublicPath = `/${config.storage.uploadPublicPath}`;
	}

	config.storage.uploadPublicPath =
		config.storage.uploadPublicPath.replace(/\/+$/, '') || '/uploads';
}

function toPositiveInteger(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}

type PartialDeep<T> = {
	[K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};

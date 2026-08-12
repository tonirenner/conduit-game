const state = {
	user: null,
	profile: null,
	mediaItems: [],
};

const sessionPanel = document.getElementById('sessionPanel');
const authForms = document.getElementById('authForms');
const profilePanel = document.getElementById('profilePanel');
const adminPanel = document.getElementById('adminPanel');
const mediaCards = document.getElementById('mediaCards');
const statusLine = document.getElementById('statusLine');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const profileForm = document.getElementById('profileForm');
const mediaForm = document.getElementById('mediaForm');
const uploadForm = document.getElementById('uploadForm');
const logoutButton = document.getElementById('logoutButton');
const playButton = document.getElementById('playButton');

init();

async function init() {
	bindForms();
	await Promise.all([
		loadSession(),
		loadMedia(),
	]);
	render();
}

function bindForms() {
	registerForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(registerForm);

		await api('/api/auth/register', {
			method: 'POST',
			body: {
				displayName: String(data.get('displayName') || ''),
				email: String(data.get('email') || ''),
				password: String(data.get('password') || ''),
			},
		});

		registerForm.reset();
		await loadSession();
		render();
		setStatus('Expeditionskonto erstellt.');
	});

	loginForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(loginForm);

		await api('/api/auth/login', {
			method: 'POST',
			body: {
				email: String(data.get('email') || ''),
				password: String(data.get('password') || ''),
			},
		});

		loginForm.reset();
		await loadSession();
		render();
		setStatus('Session aktiv.');
	});

	profileForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(profileForm);

		const response = await api('/api/player/profile', {
			method: 'PUT',
			body: {
				displayName: String(data.get('displayName') || ''),
				profile: {
					commandFocus: String(data.get('commandFocus') || ''),
				},
			},
		});

		state.user = response.user;
		state.profile = response.profile;
		render();
		setStatus('Profil gespeichert.');
	});

	mediaForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(mediaForm);

		await api('/api/admin/media', {
			method: 'POST',
			body: {
				type: String(data.get('type') || 'image'),
				title: String(data.get('title') || ''),
				description: String(data.get('description') || ''),
				url: String(data.get('url') || ''),
				thumbnailUrl: String(data.get('thumbnailUrl') || ''),
				sortOrder: Number(data.get('sortOrder') || 0),
				published: data.get('published') === 'on',
			},
		});

		mediaForm.reset();
		await loadMedia(true);
		render();
		setStatus('Showcase-Eintrag gespeichert.');
	});

	uploadForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(uploadForm);
		const response = await fetch('/api/admin/uploads', {
			method: 'POST',
			body: data,
		});
		const payload = await response.json();

		if (!response.ok) {
			throw new Error(payload.error || 'Upload failed');
		}

		const urlInput = mediaForm?.querySelector('[name="url"]');
		const typeInput = mediaForm?.querySelector('[name="type"]');

		if (urlInput) {
			urlInput.value = payload.url;
		}

		if (typeInput) {
			typeInput.value = payload.type;
		}

		uploadForm.reset();
		setStatus(`Upload bereit: ${payload.url}`);
	});

	logoutButton?.addEventListener('click', async () => {
		await api('/api/auth/logout', { method: 'POST' });
		state.user = null;
		state.profile = null;
		render();
		setStatus('Session beendet.');
	});

	playButton?.addEventListener('click', () => {
		window.location.href = '/game';
	});
}

async function loadSession() {
	const response = await api('/api/session');

	state.user = response.user;
	state.profile = response.profile;
}

async function loadMedia(includeDrafts = false) {
	const response = await api(`/api/media${includeDrafts ? '?drafts=1' : ''}`);

	state.mediaItems = response.items || [];
}

function render() {
	renderSession();
	renderMedia();
	renderAdmin();
}

function renderSession() {
	const signedIn = Boolean(state.user);

	if (authForms) {
		authForms.hidden = signedIn;
	}

	if (profilePanel) {
		profilePanel.hidden = !signedIn;
	}

	if (!signedIn) {
		if (sessionPanel) {
			sessionPanel.textContent = 'NO ACTIVE COMMAND SESSION';
		}
		return;
	}

	const displayName = state.profile?.displayName || state.user.display_name;
	const resources = state.profile?.resources || {};

	if (sessionPanel) {
		sessionPanel.innerHTML =
			`<strong>${escapeHtml(displayName)}</strong>` +
			`<span>${escapeHtml(state.user.email)}</span>` +
			`<span>${state.user.role.toUpperCase()} // EARLY ACCESS ${state.user.early_access_enabled ? 'ENABLED' : 'LOCKED'}</span>`;
	}

	setFormValue(profileForm, 'displayName', displayName);
	setFormValue(profileForm, 'commandFocus', state.profile?.commandFocus || 'system-development');

	const resourceLine = document.getElementById('resourceLine');

	if (resourceLine) {
		resourceLine.textContent =
			`CREDITS ${resources.credits ?? 0} // METAL ${resources.metal ?? 0} // FUEL ${resources.fuel ?? 0}`;
	}
}

function renderMedia() {
	if (!mediaCards) {
		return;
	}

	if (state.mediaItems.length === 0) {
		mediaCards.innerHTML = '<div class="empty">NO SHOWCASE MEDIA PUBLISHED</div>';
		return;
	}

	mediaCards.innerHTML = state.mediaItems.map((item) => {
		const background = item.type === 'image'
			? `style="background-image:linear-gradient(180deg,transparent,#02070a),url('${escapeAttribute(item.url)}')"`
			: '';
		const media = item.type === 'video'
			? `<video src="${escapeAttribute(item.url)}" muted loop playsinline></video>`
			: '';

		return (
			`<article class="card cms-card" ${background}>` +
			media +
			`<div><span>${escapeHtml(item.type).toUpperCase()}</span>` +
			`<strong>${escapeHtml(item.title)}</strong>` +
			`<small>${escapeHtml(item.description || '')}</small></div>` +
			`</article>`
		);
	}).join('');

	for (const video of mediaCards.querySelectorAll('video')) {
		video.play().catch(() => undefined);
	}
}

function renderAdmin() {
	const isAdmin = state.user?.role === 'admin';

	if (adminPanel) {
		adminPanel.hidden = !isAdmin;
	}

	const adminList = document.getElementById('adminMediaList');

	if (!adminList || !isAdmin) {
		return;
	}

	adminList.innerHTML = state.mediaItems.map((item) => (
		`<div class="admin-row">` +
		`<span>${escapeHtml(item.title)}</span>` +
		`<small>${escapeHtml(item.url)}</small>` +
		`</div>`
	)).join('');
}

async function api(path, options = {}) {
	const response = await fetch(path, {
		method: options.method || 'GET',
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});
	const payload = await response.json();

	if (!response.ok) {
		setStatus(payload.error || 'Request failed', true);
		throw new Error(payload.error || 'Request failed');
	}

	return payload;
}

function setStatus(message, isError = false) {
	if (!statusLine) {
		return;
	}

	statusLine.textContent = message;
	statusLine.dataset.error = isError ? '1' : '0';
	statusLine.hidden = false;
}

function setFormValue(form, name, value) {
	const input = form?.querySelector(`[name="${name}"]`);

	if (input) {
		input.value = value;
	}
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
	return escapeHtml(value).replaceAll('`', '&#096;');
}

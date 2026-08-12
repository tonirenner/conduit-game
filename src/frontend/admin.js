const adminState = {
	user: null,
	items: [],
};

const adminSession = document.getElementById('adminSession');
const adminStatus = document.getElementById('adminStatus');
const adminAccessDenied = document.getElementById('adminAccessDenied');
const adminWorkspace = document.getElementById('adminWorkspace');
const adminMediaList = document.getElementById('adminMediaList');
const adminMediaForm = document.getElementById('adminMediaForm');
const adminUploadForm = document.getElementById('adminUploadForm');
const adminPreview = document.getElementById('adminPreview');
const adminFormTitle = document.getElementById('adminFormTitle');
const adminResetButton = document.getElementById('adminResetButton');
const adminRefreshButton = document.getElementById('adminRefreshButton');

initAdmin();

async function initAdmin() {
	bindAdminEvents();

	try {
		const session = await adminApi('/api/session');

		adminState.user = session.user;
		renderAdminSession();

		if (!adminState.user || adminState.user.role !== 'admin') {
			renderAccessDenied();
			return;
		}

		await loadAdminMedia();
		renderAdminWorkspace();
	} catch (error) {
		setAdminStatus(error.message, true);
		renderAccessDenied();
	}
}

function bindAdminEvents() {
	adminUploadForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(adminUploadForm);
		const response = await fetch('/api/admin/uploads', {
			method: 'POST',
			body: data,
		});
		const payload = await response.json();

		if (!response.ok) {
			setAdminStatus(payload.error || 'Upload failed', true);
			return;
		}

		setFormValue(adminMediaForm, 'url', payload.url);
		setFormValue(adminMediaForm, 'type', payload.type);
		adminUploadForm.reset();
		renderPreview();
		setAdminStatus(`Upload bereit: ${payload.url}`);
	});

	adminMediaForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const payload = readMediaForm();
		const id = payload.id;
		const path = id ? `/api/admin/media/${encodeURIComponent(id)}` : '/api/admin/media';

		delete payload.id;

		await adminApi(path, {
			method: id ? 'PUT' : 'POST',
			body: payload,
		});

		resetMediaForm();
		await loadAdminMedia();
		renderMediaList();
		setAdminStatus('Showcase-Eintrag gespeichert.');
	});

	adminMediaForm?.querySelector('[name="url"]')?.addEventListener('input', renderPreview);
	adminMediaForm?.querySelector('[name="type"]')?.addEventListener('change', renderPreview);
	adminResetButton?.addEventListener('click', resetMediaForm);
	adminRefreshButton?.addEventListener('click', async () => {
		await loadAdminMedia();
		renderMediaList();
		setAdminStatus('Showcase-Liste aktualisiert.');
	});
}

async function loadAdminMedia() {
	const response = await adminApi('/api/media?drafts=1');

	adminState.items = response.items || [];
}

function renderAdminSession() {
	if (!adminSession) {
		return;
	}

	if (!adminState.user) {
		adminSession.textContent = 'NO ACTIVE SESSION';
		return;
	}

	adminSession.innerHTML =
		`<strong>${escapeHtml(adminState.user.display_name)}</strong>` +
		`<span>${escapeHtml(adminState.user.email)}</span>` +
		`<span>${adminState.user.role.toUpperCase()}</span>`;
}

function renderAccessDenied() {
	if (adminAccessDenied) {
		adminAccessDenied.hidden = false;
	}

	if (adminWorkspace) {
		adminWorkspace.hidden = true;
	}
}

function renderAdminWorkspace() {
	if (adminAccessDenied) {
		adminAccessDenied.hidden = true;
	}

	if (adminWorkspace) {
		adminWorkspace.hidden = false;
	}

	renderMediaList();
	renderPreview();
}

function renderMediaList() {
	if (!adminMediaList) {
		return;
	}

	if (adminState.items.length === 0) {
		adminMediaList.innerHTML = '<div class="empty">NO SHOWCASE ITEMS</div>';
		return;
	}

	adminMediaList.innerHTML = adminState.items.map((item) => {
		const preview = renderMediaPreview(item, 'admin-thumb');
		const status = item.published ? 'PUBLISHED' : 'DRAFT';

		return (
			`<article class="admin-media-item" data-id="${escapeAttribute(item.id)}">` +
			preview +
			`<div class="admin-media-copy">` +
			`<span>${escapeHtml(item.type).toUpperCase()} // ${status} // ORDER ${Number(item.sortOrder || 0)}</span>` +
			`<strong>${escapeHtml(item.title)}</strong>` +
			`<small>${escapeHtml(item.description || item.url)}</small>` +
			`</div>` +
			`<div class="admin-media-actions">` +
			`<button class="btn" data-action="edit" type="button">EDIT</button>` +
			`<button class="btn" data-action="delete" type="button">DELETE</button>` +
			`</div>` +
			`</article>`
		);
	}).join('');

	for (const button of adminMediaList.querySelectorAll('button')) {
		button.addEventListener('click', handleMediaAction);
	}
}

async function handleMediaAction(event) {
	const button = event.currentTarget;
	const itemElement = button.closest('[data-id]');
	const item = adminState.items.find((candidate) => candidate.id === itemElement?.dataset.id);

	if (!item) {
		return;
	}

	if (button.dataset.action === 'edit') {
		writeMediaForm(item);
		setAdminStatus(`Bearbeite: ${item.title}`);
		return;
	}

	if (button.dataset.action === 'delete') {
		if (!confirm(`Showcase-Eintrag "${item.title}" loeschen?`)) {
			return;
		}

		await adminApi(`/api/admin/media/${encodeURIComponent(item.id)}`, {
			method: 'DELETE',
		});
		await loadAdminMedia();
		renderMediaList();
		setAdminStatus('Showcase-Eintrag geloescht.');
	}
}

function readMediaForm() {
	const data = new FormData(adminMediaForm);

	return {
		id: String(data.get('id') || ''),
		type: String(data.get('type') || 'image'),
		title: String(data.get('title') || ''),
		description: String(data.get('description') || ''),
		url: String(data.get('url') || ''),
		thumbnailUrl: String(data.get('thumbnailUrl') || ''),
		sortOrder: Number(data.get('sortOrder') || 0),
		published: data.get('published') === 'on',
	};
}

function writeMediaForm(item) {
	setFormValue(adminMediaForm, 'id', item.id);
	setFormValue(adminMediaForm, 'type', item.type);
	setFormValue(adminMediaForm, 'title', item.title);
	setFormValue(adminMediaForm, 'description', item.description || '');
	setFormValue(adminMediaForm, 'url', item.url);
	setFormValue(adminMediaForm, 'thumbnailUrl', item.thumbnailUrl || '');
	setFormValue(adminMediaForm, 'sortOrder', item.sortOrder || 0);

	const published = adminMediaForm?.querySelector('[name="published"]');

	if (published) {
		published.checked = Boolean(item.published);
	}

	if (adminFormTitle) {
		adminFormTitle.textContent = 'EDIT SHOWCASE ITEM';
	}

	renderPreview();
	adminMediaForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetMediaForm() {
	adminMediaForm?.reset();
	setFormValue(adminMediaForm, 'id', '');
	setFormValue(adminMediaForm, 'sortOrder', 0);

	const published = adminMediaForm?.querySelector('[name="published"]');

	if (published) {
		published.checked = true;
	}

	if (adminFormTitle) {
		adminFormTitle.textContent = 'CREATE SHOWCASE ITEM';
	}

	renderPreview();
}

function renderPreview() {
	if (!adminPreview) {
		return;
	}

	const item = readMediaForm();

	if (!item.url) {
		adminPreview.textContent = 'NO MEDIA SELECTED';
		return;
	}

	adminPreview.innerHTML = renderMediaPreview(item, 'admin-preview-media');
}

function renderMediaPreview(item, className) {
	if (item.type === 'video') {
		return `<video class="${className}" src="${escapeAttribute(item.url)}" muted loop playsinline controls></video>`;
	}

	return `<img class="${className}" src="${escapeAttribute(item.url)}" alt="">`;
}

async function adminApi(path, options = {}) {
	const response = await fetch(path, {
		method: options.method || 'GET',
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});
	const payload = await response.json();

	if (!response.ok) {
		throw new Error(payload.error || 'Request failed');
	}

	return payload;
}

function setAdminStatus(message, isError = false) {
	if (!adminStatus) {
		return;
	}

	adminStatus.textContent = message;
	adminStatus.dataset.error = isError ? '1' : '0';
	adminStatus.hidden = false;
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

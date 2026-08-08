import {
	BUILD_CATALOG,
	type BuildableId,
} from '../build/BuildCatalog';

export type BuildMenuContext = {
	title: string;
	subtitle?: string;
	options: BuildableId[];
	queue?: Array<{
		label: string;
		progress: number;
	}>;
};

export type BuildMenuOptions = {
	onBuild: (buildableId: BuildableId) => void;
	onClose?: () => void;
};

export class BuildMenu {
	private readonly root: HTMLDivElement;
	private readonly toggleButton: HTMLButtonElement;
	private visible = false;
	private context: BuildMenuContext | null = null;
	private renderSignature = '';

	constructor(
		private readonly options: BuildMenuOptions,
	) {
		this.root = document.createElement('div');
		this.toggleButton = document.createElement('button');

		this.configureRoot();
		this.configureToggleButton();

		document.body.appendChild(this.root);
		document.body.appendChild(this.toggleButton);

		this.render();
	}

	setContext(context: BuildMenuContext | null): void {
		this.context = context;

		if (!context) {
			this.visible = false;
		}

		this.render();
	}

	toggle(): void {
		if (!this.context) {
			return;
		}

		this.visible = !this.visible;
		this.renderSignature = '';
		this.render();
	}

	open(): void {
		if (!this.context) {
			return;
		}

		this.visible = true;
		this.renderSignature = '';
		this.render();
	}

	close(): void {
		if (!this.visible) {
			return;
		}

		this.visible = false;
		this.renderSignature = '';
		this.render();
		this.options.onClose?.();
	}

	isOpen(): boolean {
		return this.visible;
	}

	dispose(): void {
		this.root.remove();
		this.toggleButton.remove();
	}

	private configureRoot(): void {
		const style = this.root.style;

		style.position = 'fixed';
		style.left = '50%';
		style.bottom = '104px';
		style.transform = 'translateX(-50%)';
		style.zIndex = '45';
		style.width = 'min(680px, calc(100vw - 290px))';
		style.padding = '12px';
		style.border = '1px solid rgba(143,231,255,0.34)';
		style.borderRadius = '10px';
		style.background = 'rgba(3, 11, 18, 0.92)';
		style.backdropFilter = 'blur(10px)';
		style.boxShadow = '0 12px 36px rgba(0,0,0,0.36)';
		style.color = '#d9f5ff';
		style.font = '12px/1.35 monospace';
		style.pointerEvents = 'auto';
	}

	private configureToggleButton(): void {
		const style = this.toggleButton.style;

		this.toggleButton.textContent = 'BUILD [B]';
		this.toggleButton.type = 'button';
		style.position = 'fixed';
		style.left = '50%';
		style.bottom = '104px';
		style.transform = 'translateX(-50%)';
		style.zIndex = '44';
		style.padding = '9px 16px';
		style.border = '1px solid rgba(143,231,255,0.42)';
		style.borderRadius = '6px';
		style.background = 'rgba(7, 23, 34, 0.90)';
		style.color = '#9beaff';
		style.font = '12px monospace';
		style.cursor = 'pointer';

		this.toggleButton.addEventListener('click', () => {
			this.toggle();
		});
	}

	private render(): void {
		const signature = this.getRenderSignature();

		if (signature === this.renderSignature) {
			return;
		}

		this.renderSignature = signature;
		const hasContext = Boolean(this.context);

		this.toggleButton.style.display = hasContext && !this.visible
			? 'block'
			: 'none';

		if (!this.visible || !this.context) {
			this.root.style.display = 'none';
			return;
		}

		this.root.style.display = 'block';

		const buttons = this.context.options.map((id) => {
			const item = BUILD_CATALOG[id];

			return (
				`<button data-build-id="${item.id}" ` +
				`style="min-width:132px;flex:1 1 132px;padding:10px;` +
				`border:1px solid rgba(143,231,255,0.24);border-radius:6px;` +
				`background:rgba(8,25,38,0.86);color:#dcf8ff;text-align:left;cursor:pointer;">` +
				`<span style="display:inline-block;padding:2px 5px;margin-right:6px;` +
				`border:1px solid rgba(143,231,255,0.36);color:#8fe7ff;">${item.icon}</span>` +
				`<b>${item.label}</b><br>` +
				`<span style="opacity:.66">${item.buildTimeSeconds}s · ` +
				`${item.cost.credits}C · ${item.cost.metal}M</span>` +
				`</button>`
			);
		}).join('');

		const queue = this.context.queue?.length
			? (
				`<div style="margin-top:10px;padding-top:9px;border-top:1px solid rgba(143,231,255,.16);">` +
				`<b style="color:#8fe7ff">QUEUE</b>` +
				this.context.queue.map((item) => (
					`<div style="margin-top:5px">${item.label} · ${Math.round(item.progress * 100)}%</div>`
				)).join('') +
				`</div>`
			)
			: '';

		this.root.innerHTML =
			`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">` +
			`<div><b style="color:#8fe7ff">${this.context.title}</b>` +
			`${this.context.subtitle ? `<div style="opacity:.64;margin-top:2px">${this.context.subtitle}</div>` : ''}` +
			`</div>` +
			`<button data-close-build-menu style="border:0;background:transparent;color:#bfefff;cursor:pointer;font:16px monospace">×</button>` +
			`</div>` +
			`<div style="display:flex;gap:8px;flex-wrap:wrap">${buttons || '<span style="opacity:.6">Keine Produktion verfügbar.</span>'}</div>` +
			queue;

		for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-build-id]')) {
			button.addEventListener('click', () => {
				const id = button.dataset.buildId as BuildableId | undefined;

				if (id) {
					this.options.onBuild(id);
				}
			});
		}

		this.root.querySelector<HTMLButtonElement>('button[data-close-build-menu]')
			?.addEventListener('click', () => this.close());
	}
	private getRenderSignature(): string {
		if (!this.context) {
			return `none:${this.visible ? 'open' : 'closed'}`;
		}

		return [
			this.visible ? 'open' : 'closed',
			this.context.title,
			this.context.subtitle ?? '',
			this.context.options.join(','),
			...(this.context.queue ?? []).map(
				(item) => `${item.label}:${Math.round(item.progress * 100)}`,
			),
		].join('|');
	}

}

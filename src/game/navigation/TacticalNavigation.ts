export type TacticalMoveDraft = {
	anchor: {
		x: number;
		y: number;
		z: number;
	};
	heightOffset: number;
};

export type TacticalMoveTarget = {
	x: number;
	y: number;
	z: number;
};

export type TacticalNavigationState = {
	moveDraft: TacticalMoveDraft | null;
};

export function createTacticalNavigationState(): TacticalNavigationState {
	return {
		moveDraft: null,
	};
}

export function startTacticalMoveDraft(
	state: TacticalNavigationState,
	anchor: TacticalMoveTarget,
): TacticalNavigationState {
	return {
		...state,
		moveDraft: {
			anchor: {
				...anchor,
			},
			heightOffset: 0,
		},
	};
}

export function updateTacticalMoveDraftHeight(
	state: TacticalNavigationState,
	heightOffset: number,
): TacticalNavigationState {
	if (!state.moveDraft) {
		return state;
	}

	return {
		...state,
		moveDraft: {
			...state.moveDraft,
			heightOffset,
		},
	};
}

export function confirmTacticalMoveDraft(
	state: TacticalNavigationState,
): {
	state: TacticalNavigationState;
	target: TacticalMoveTarget | null;
} {
	if (!state.moveDraft) {
		return {
			state,
			target: null,
		};
	}

	const target = getTacticalMoveDraftTarget(state.moveDraft);

	return {
		state: {
			...state,
			moveDraft: null,
		},
		target,
	};
}

export function cancelTacticalMoveDraft(
	state: TacticalNavigationState,
): TacticalNavigationState {
	return {
		...state,
		moveDraft: null,
	};
}

export function getTacticalMoveDraftTarget(
	draft: TacticalMoveDraft,
): TacticalMoveTarget {
	return {
		x: draft.anchor.x,
		y: draft.anchor.y + draft.heightOffset,
		z: draft.anchor.z,
	};
}

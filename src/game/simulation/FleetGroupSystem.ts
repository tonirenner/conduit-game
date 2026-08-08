import type {
    Fleet,
    FleetOrder,
    GameWorld,
} from '../model/GameWorld';

export function createOrReplaceControlGroup(
    world: GameWorld,
    shipIds: string[],
    hotkey: number,
): GameWorld {
    const uniqueShipIds = [...new Set(shipIds)].filter((shipId) => {
        const ship = world.ships.find((item) => item.id === shipId);
        return ship?.factionId === 'player';
    });

    if (uniqueShipIds.length === 0) {
        return world;
    }

    const selectedShips = world.ships.filter((ship) => uniqueShipIds.includes(ship.id));
    const nodeId = selectedShips[0]?.nodeId;

    if (!nodeId || selectedShips.some((ship) => ship.nodeId !== nodeId)) {
        return world;
    }

    const selectedSet = new Set(uniqueShipIds);
    const preservedFleets: Fleet[] = [];

    for (const fleet of world.fleets) {
        if (fleet.hotkey === hotkey && fleet.factionId === 'player') {
            continue;
        }

        if (fleet.factionId !== 'player') {
            preservedFleets.push(fleet);
            continue;
        }

        const remainingShipIds = fleet.shipIds.filter((shipId) => !selectedSet.has(shipId));

        if (remainingShipIds.length > 0) {
            preservedFleets.push({
                ...fleet,
                shipIds: remainingShipIds,
            });
        }
    }

    const id = `player-control-${hotkey}`;
    const group: Fleet = {
        id,
        name: `Fleet ${hotkey}`,
        factionId: 'player',
        nodeId,
        shipIds: uniqueShipIds,
        hotkey,
        order: {
            type: 'hold',
        },
    };

    const nextOverrides = {
        ...(world.shipOrderOverrides ?? {}),
    };

    for (const shipId of uniqueShipIds) {
        delete nextOverrides[shipId];
    }

    return {
        ...world,
        fleets: [...preservedFleets, group],
        selectedFleetId: id,
        shipOrderOverrides: nextOverrides,
    };
}

export function dissolveControlGroup(
    world: GameWorld,
    hotkey: number,
): GameWorld {
    const fleet = world.fleets.find(
        (item) => item.factionId === 'player' && item.hotkey === hotkey,
    );

    if (!fleet) {
        return world;
    }

    const remaining = world.fleets.filter((item) => item.id !== fleet.id);
    const holdingFleets: Fleet[] = [];

    fleet.shipIds.forEach((shipId, index) => {
        const ship = world.ships.find((item) => item.id === shipId);

        if (!ship) {
            return;
        }

        holdingFleets.push({
            id: `unassigned-${ship.id}-${index}`,
            name: `Unassigned · ${ship.name}`,
            factionId: ship.factionId,
            nodeId: ship.nodeId,
            shipIds: [ship.id],
            order: {
                type: 'hold',
            },
        });
    });

    return {
        ...world,
        fleets: [...remaining, ...holdingFleets],
        selectedFleetId: holdingFleets[0]?.id ?? remaining[0]?.id ?? null,
    };
}

export function getControlGroup(
    world: GameWorld,
    hotkey: number,
): Fleet | null {
    return world.fleets.find(
        (fleet) => fleet.factionId === 'player' && fleet.hotkey === hotkey,
    ) ?? null;
}

export function setShipOrderOverrides(
    world: GameWorld,
    shipIds: string[],
    order: FleetOrder,
): GameWorld {
    const next = {
        ...(world.shipOrderOverrides ?? {}),
    };

    for (const shipId of shipIds) {
        const ship = world.ships.find((item) => item.id === shipId);

        if (!ship || ship.factionId !== 'player') {
            continue;
        }

        next[shipId] = cloneOrder(order);
    }

    return {
        ...world,
        shipOrderOverrides: next,
    };
}

export function clearShipOrderOverrides(
    world: GameWorld,
    shipIds: string[],
): GameWorld {
    const next = {
        ...(world.shipOrderOverrides ?? {}),
    };

    for (const shipId of shipIds) {
        delete next[shipId];
    }

    return {
        ...world,
        shipOrderOverrides: next,
    };
}

function cloneOrder(order: FleetOrder): FleetOrder {
    if (order.type === 'move_tactical') {
        return {
            ...order,
            target: { ...order.target },
        };
    }

    if (order.type === 'move_to_wormhole') {
        return {
            ...order,
            entryPosition: { ...order.entryPosition },
        };
    }

    return { ...order };
}

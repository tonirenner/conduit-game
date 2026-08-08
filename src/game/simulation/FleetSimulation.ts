import type {
    FactionId,
    Fleet,
    GameWorld,
    ShipRole,
    ShipDefinition,
} from '../model/GameWorld';
import { KILOMETER } from '../spatial/SpatialUnits';

export function updateFleetSimulation(
    world: GameWorld,
    deltaSeconds: number,
): GameWorld {
    const nextShips = world.ships.map((ship) => ({
       ...ship,
       position: {
          ...ship.position,
       },
       velocity: {
          ...ship.velocity,
       },
       systemPosition: {
          ...ship.systemPosition,
       },
       systemVelocity: {
          ...ship.systemVelocity,
       },
    }));

    const nextShipsById = new Map(
       nextShips.map((ship) => [ship.id, ship]),
    );

    const nextFleets: Fleet[] = world.fleets.map((fleet) => ({
       ...fleet,
       order: {
          ...fleet.order,
       },
    }));

    for (const fleet of nextFleets) {
       if (fleet.order.type === 'move_to_wormhole') {
          updateFleetWormholeApproach(
             fleet,
             world,
             nextShipsById,
             deltaSeconds,
          );
          continue;
       }

       if (fleet.order.type === 'move_strategic') {
          updateFleetStrategicMove(
             fleet,
             world,
             nextShipsById,
             deltaSeconds,
          );
          continue;
       }

       if (fleet.order.type === 'attack_fleet') {
          updateFleetAttack(
             fleet,
             nextFleets,
             nextShipsById,
             deltaSeconds,
          );
          continue;
       }

       if (fleet.order.type !== 'move_tactical') {
          continue;
       }

       const target = fleet.order.target;
       const space = fleet.order.space;

       fleet.shipIds.forEach((shipId, index) => {
          const ship = nextShipsById.get(shipId);

          if (!ship) {
             return;
          }

          const formationOffset =
                   space === 'system'
                   ? getSystemFormationOffset(index)
                   : getStrategicFormationOffset(index);
          const moveTarget = {
             x: target.x + formationOffset.x,
             y: target.y + formationOffset.y,
             z: target.z + formationOffset.z,
          };

          if (space === 'system') {
             updateVectorMoveOrder(
                ship.systemPosition,
                ship.systemVelocity,
                moveTarget,
                ship.maxSpeed,
                ship.turnRate,
                deltaSeconds,
                40,
             );
             return;
          }

          updateVectorMoveOrder(
             ship.position,
             ship.velocity,
             moveTarget,
             ship.strategicMaxSpeed,
             ship.turnRate,
             deltaSeconds,
             0.04,
          );
       });
    }

    return {
       ...world,
       ships: nextShips.filter((ship) => ship.hull > 0),
       fleets: nextFleets
          .map((fleet) => ({
             ...fleet,
             shipIds: fleet.shipIds.filter(
                (shipId) => (nextShipsById.get(shipId)?.hull ?? 0) > 0,
             ),
          }))
          .filter((fleet) => fleet.shipIds.length > 0),
    };
}

export function setFleetTacticalMoveOrder(
    world: GameWorld,
    fleetId: string,
    target: {
       x: number;
       y: number;
       z: number;
    },
    space: 'strategic' | 'system' = 'strategic',
): GameWorld {
    return {
       ...world,
       fleets: world.fleets.map((fleet) => (
          fleet.id === fleetId
          ? {
                ...fleet,
                order: {
                   type: 'move_tactical',
                   space,
                   nodeId: space === 'system' ? fleet.nodeId : undefined,
                   target: {
                      ...target,
                   },
                },
             }
          : fleet
       )),
    };
}

export function setFleetWormholeMoveOrder(
    world: GameWorld,
    fleetId: string,
    targetNodeId: string,
    entryPosition: {
       x: number;
       y: number;
       z: number;
    },
): GameWorld {
    const fleet = world.fleets.find((item) => item.id === fleetId);

    if (!fleet || fleet.nodeId === targetNodeId) {
       return world;
    }

    const lane = world.lanes.find((item) => (
       (item.fromNodeId === fleet.nodeId && item.toNodeId === targetNodeId) ||
       (item.toNodeId === fleet.nodeId && item.fromNodeId === targetNodeId)
    ));

    if (!lane) {
       return world;
    }

    return {
       ...world,
       fleets: world.fleets.map((item) => (
          item.id === fleetId
          ? {
               ...item,
               order: {
                  type: 'move_to_wormhole',
                  targetNodeId,
                  entryPosition: {
                     ...entryPosition,
                  },
               },
            }
          : item
       )),
    };
}

export function setFleetStrategicMoveOrder(
    world: GameWorld,
    fleetId: string,
    targetNodeId: string,
): GameWorld {
    const fleet = world.fleets.find((item) => item.id === fleetId);
    const fromNode = fleet
                     ? world.nodes.find((node) => node.id === fleet.nodeId)
                     : null;
    const toNode = world.nodes.find((node) => node.id === targetNodeId);

    if (!fleet || !fromNode || !toNode || fleet.nodeId === targetNodeId) {
       return world;
    }

    const lane = world.lanes.find((item) => (
       (item.fromNodeId === fromNode.id && item.toNodeId === toNode.id) ||
       (item.fromNodeId === toNode.id && item.toNodeId === fromNode.id)
    ));

    if (!lane) {
       return world;
    }

    return {
       ...world,
       fleets: world.fleets.map((item) => (
          item.id === fleetId
          ? {
                ...item,
                order: {
                   type: 'move_strategic',
                   targetNodeId,
                   progress: 0,
                   durationSeconds: lane.travelTimeSeconds,
                },
             }
          : item
       )),
    };
}

export function setFleetAttackOrder(
    world: GameWorld,
    fleetId: string,
    targetFleetId: string,
): GameWorld {
    const fleet = world.fleets.find((item) => item.id === fleetId);
    const targetFleet = world.fleets.find((item) => item.id === targetFleetId);

    if (
       !fleet ||
       !targetFleet ||
       fleet.id === targetFleet.id ||
       fleet.factionId === targetFleet.factionId
    ) {
       return world;
    }

    return {
       ...world,
       fleets: world.fleets.map((item) => (
          item.id === fleetId
          ? {
                ...item,
                order: {
                   type: 'attack_fleet',
                   targetFleetId,
                },
             }
          : item
       )),
    };
}

export function addShipyardStation(
    world: GameWorld,
    nodeId: string,
    factionId: GameWorld['fleets'][number]['factionId'],
    position: {
       x: number;
       y: number;
       z: number;
    },
): GameWorld {
    const stationIndex = world.stations.length + 1;

    return {
       ...world,
       stations: [
          ...world.stations,
          {
             id: `station-${nodeId}-${stationIndex}`,
             name: `Shipyard ${stationIndex}`,
             type: 'shipyard',
             factionId,
             nodeId,
             position: {
                ...position,
             },
             buildState: 'operational',
             constructionProgress: 1,
             constructionDurationSeconds: 0,
             productionQueue: [],
          },
       ],
    };
}

export function buildShipAtShipyard(
    world: GameWorld,
    stationId: string,
    role: ShipRole = 'fighter',
): GameWorld {
    const station = world.stations.find((item) => item.id === stationId);

    if (!station || (station.type !== 'shipyard' && station.type !== 'shipyard_small' && station.type !== 'shipyard_large')) {
       return world;
    }

    const strategicNode = world.nodes.find((node) => node.id === station.nodeId);
    const shipNumber = world.ships.filter(
       (ship) => ship.factionId === station.factionId,
    ).length + 1;
    const ship = createBuiltShip(
       station.factionId,
       station.nodeId,
       role,
       shipNumber,
       {
          x: (strategicNode?.position.x ?? 0) + 1.4,
          y: 0,
          z: strategicNode?.position.y ?? 0,
       },
       {
          x: station.position.x + 1.2 * KILOMETER,
          y: station.position.y,
          z: station.position.z,
       },
    );
    const existingFleet = world.fleets.find(
       (fleet) =>
          fleet.factionId === station.factionId &&
          fleet.nodeId === station.nodeId &&
          fleet.order.type !== 'move_strategic',
    );

    return {
       ...world,
       ships: [
          ...world.ships,
          ship,
       ],
       fleets:
          existingFleet
          ? world.fleets.map((fleet) => (
             fleet.id === existingFleet.id
             ? {
                   ...fleet,
                   shipIds: [
                      ...fleet.shipIds,
                      ship.id,
                   ],
                }
             : fleet
          ))
          : [
                ...world.fleets,
                {
                   id: `fleet-${station.factionId}-${station.nodeId}-${shipNumber}`,
                   name: `${station.factionId} fleet`,
                   factionId: station.factionId,
                   nodeId: station.nodeId,
                   shipIds: [ship.id],
                   order: {
                      type: 'hold',
                   },
                },
             ],
    };
}

function updateFleetWormholeApproach(
    fleet: Fleet,
    world: GameWorld,
    nextShipsById: Map<string, ShipDefinition>,
    deltaSeconds: number,
): void {
    if (fleet.order.type !== 'move_to_wormhole') {
       return;
    }

    const targetNodeId = fleet.order.targetNodeId;
    const entryPosition = {
       ...fleet.order.entryPosition,
    };

    const lane = world.lanes.find((item) => (
       (item.fromNodeId === fleet.nodeId && item.toNodeId === targetNodeId) ||
       (item.toNodeId === fleet.nodeId && item.fromNodeId === targetNodeId)
    ));

    if (!lane) {
       fleet.order = {
          type: 'hold',
       };
       return;
    }

    let liveShipCount = 0;
    let shipsInsideWormhole = 0;

    fleet.shipIds.forEach((shipId, index) => {
       const ship = nextShipsById.get(shipId);

       if (!ship || ship.hull <= 0) {
          return;
       }

       liveShipCount++;

       /*
        * Tight formation near the gate. The offset is intentionally much
        * smaller than normal fleet formation, so all ships visibly pass
        * through the same wormhole instead of flying beside it.
        */
       const formationOffset = getSystemFormationOffset(index);
       const approachTarget = {
          x: entryPosition.x + formationOffset.x * 0.16,
          y: entryPosition.y + formationOffset.y * 0.16,
          z: entryPosition.z + formationOffset.z * 0.16,
       };

       updateVectorMoveOrder(
          ship.systemPosition,
          ship.systemVelocity,
          approachTarget,
          ship.maxSpeed,
          ship.turnRate,
          deltaSeconds,
          30,
       );

       const distanceToEntry = getDistance(
          ship.systemPosition,
          entryPosition,
       );

       if (distanceToEntry <= 620) {
          shipsInsideWormhole++;
       }
    });

    if (
       liveShipCount <= 0 ||
       shipsInsideWormhole < liveShipCount
    ) {
       return;
    }

    /*
     * The fleet has physically entered the wormhole.
     * From the next frame onward it is in strategic transit and disappears
     * from the source SystemView until arrival.
     */
    fleet.order = {
       type: 'move_strategic',
       targetNodeId,
       progress: 0,
       durationSeconds: lane.travelTimeSeconds,
    };

    for (const shipId of fleet.shipIds) {
       const ship = nextShipsById.get(shipId);

       if (!ship) {
          continue;
       }

       ship.systemVelocity.x = 0;
       ship.systemVelocity.y = 0;
       ship.systemVelocity.z = 0;
    }
}

function updateFleetStrategicMove(
    fleet: Fleet,
    world: GameWorld,
    nextShipsById: Map<string, ShipDefinition>,
    deltaSeconds: number,
): void {
    if (fleet.order.type !== 'move_strategic') {
       return;
    }

    const targetNodeId = fleet.order.targetNodeId;
    const fromNode = world.nodes.find((node) => node.id === fleet.nodeId);
    const toNode = world.nodes.find((node) => node.id === targetNodeId);

    if (!fromNode || !toNode) {
       fleet.order = {
          type: 'hold',
       };
       return;
    }

    const progress = Math.min(
       1,
       fleet.order.progress +
       deltaSeconds / Math.max(0.1, fleet.order.durationSeconds),
    );
    const x = lerp(fromNode.position.x, toNode.position.x, progress);
    const z = lerp(fromNode.position.y, toNode.position.y, progress);

    for (const shipId of fleet.shipIds) {
       const ship = nextShipsById.get(shipId);

       if (!ship) {
          continue;
       }

       ship.position.x = x;
       ship.position.y = 0;
       ship.position.z = z;
       ship.velocity.x = toNode.position.x - fromNode.position.x;
       ship.velocity.y = 0;
       ship.velocity.z = toNode.position.y - fromNode.position.y;
    }

    if (progress < 1) {
       fleet.order = {
          ...fleet.order,
          progress,
       };
       return;
    }

    fleet.nodeId = toNode.id;
    fleet.order = {
       type: 'hold',
    };

    fleet.shipIds.forEach((shipId, index) => {
       const ship = nextShipsById.get(shipId);

       if (!ship) {
          return;
       }

       const strategicOffset = getStrategicFormationOffset(index);
       const systemOffset = getSystemFormationOffset(index);

       ship.nodeId = toNode.id;
       ship.position.x = toNode.position.x + strategicOffset.x;
       ship.position.y = 0;
       ship.position.z = toNode.position.y + strategicOffset.z;
       ship.velocity.x = 0;
       ship.velocity.y = 0;
       ship.velocity.z = 0;
       ship.systemPosition.x = systemOffset.x;
       ship.systemPosition.y = systemOffset.y;
       ship.systemPosition.z = 10 * KILOMETER + systemOffset.z;
       ship.systemVelocity.x = 0;
       ship.systemVelocity.y = 0;
       ship.systemVelocity.z = 0;
    });
}

function updateFleetAttack(
    fleet: Fleet,
    fleets: Fleet[],
    nextShipsById: Map<string, ShipDefinition>,
    deltaSeconds: number,
): void {
    if (fleet.order.type !== 'attack_fleet') {
       return;
    }

    const targetFleetId = fleet.order.targetFleetId;
    const targetFleet = fleets.find((item) => item.id === targetFleetId);

    if (!targetFleet || targetFleet.shipIds.length === 0) {
       fleet.order = {
          type: 'hold',
       };
       return;
    }

    const inSameSystem = fleet.nodeId === targetFleet.nodeId;
    const attackerCenter = getFleetCenter(fleet, nextShipsById, inSameSystem);
    const targetCenter = getFleetCenter(targetFleet, nextShipsById, inSameSystem);

    if (!attackerCenter || !targetCenter) {
       fleet.order = {
          type: 'hold',
       };
       return;
    }

    const range = inSameSystem ? 5.2 * KILOMETER : 2.4;
    const distance = getDistance(attackerCenter, targetCenter);

    if (distance > range) {
       fleet.shipIds.forEach((shipId, index) => {
          const ship = nextShipsById.get(shipId);

          if (!ship) {
             return;
          }

          const offset =
                   inSameSystem
                   ? getSystemFormationOffset(index)
                   : getStrategicFormationOffset(index);
          const target = {
             x: targetCenter.x + offset.x,
             y: targetCenter.y + offset.y,
             z: targetCenter.z + offset.z,
          };

          updateVectorMoveOrder(
             inSameSystem ? ship.systemPosition : ship.position,
             inSameSystem ? ship.systemVelocity : ship.velocity,
             target,
             inSameSystem ? ship.maxSpeed : ship.strategicMaxSpeed,
             ship.turnRate,
             deltaSeconds,
             inSameSystem ? 40 : 0.04,
          );
       });
       return;
    }

    const damagePerSecond = fleet.shipIds.reduce((sum, shipId) => {
       const ship = nextShipsById.get(shipId);

       if (!ship || ship.hull <= 0) {
          return sum;
       }

       return sum + getShipDamage(ship.role);
    }, 0);
    const targetShipId = targetFleet.shipIds.find(
       (shipId) => (nextShipsById.get(shipId)?.hull ?? 0) > 0,
    );
    const targetShip = targetShipId
                       ? nextShipsById.get(targetShipId)
                       : null;

    if (!targetShip) {
       return;
    }

    targetShip.hull = Math.max(
       0,
       targetShip.hull - damagePerSecond * deltaSeconds,
    );
}

function updateVectorMoveOrder(
    position: ShipDefinition['position'],
    velocity: ShipDefinition['velocity'],
    target: {
       x: number;
       y: number;
       z: number;
    },
    maxSpeed: number,
    turnRate: number,
    deltaSeconds: number,
    stopDistance: number,
): void {
    const toTarget = {
       x: target.x - position.x,
       y: target.y - position.y,
       z: target.z - position.z,
    };

    const distance = Math.sqrt(
       toTarget.x * toTarget.x +
       toTarget.y * toTarget.y +
       toTarget.z * toTarget.z,
    );

    if (distance < stopDistance) {
       velocity.x = 0;
       velocity.y = 0;
       velocity.z = 0;
       return;
    }

    const desiredSpeed = Math.min(
       maxSpeed,
       distance * 1.35,
    );

    const invDistance = 1 / Math.max(distance, 0.0001);
    const desiredVelocity = {
       x: toTarget.x * invDistance * desiredSpeed,
       y: toTarget.y * invDistance * desiredSpeed,
       z: toTarget.z * invDistance * desiredSpeed,
    };

    const steering = Math.min(1, turnRate * deltaSeconds);

    velocity.x += (desiredVelocity.x - velocity.x) * steering;
    velocity.y += (desiredVelocity.y - velocity.y) * steering;
    velocity.z += (desiredVelocity.z - velocity.z) * steering;

    position.x += velocity.x * deltaSeconds;
    position.y += velocity.y * deltaSeconds;
    position.z += velocity.z * deltaSeconds;
}

function createBuiltShip(
    factionId: FactionId,
    nodeId: string,
    role: ShipRole,
    shipNumber: number,
    position: ShipDefinition['position'],
    systemPosition: ShipDefinition['systemPosition'],
): ShipDefinition {
    return {
       id: `${factionId}-${nodeId}-${role}-${shipNumber}`,
       name: `${role} ${shipNumber}`,
       role,
       factionId,
       nodeId,
       position: {
          ...position,
       },
       velocity: {
          x: 0,
          y: 0,
          z: 0,
       },
       systemPosition: {
          ...systemPosition,
       },
       systemVelocity: {
          x: 0,
          y: 0,
          z: 0,
       },
       hull: getShipHull(role),
       maxHull: getShipHull(role),
       maxSpeed: (role === 'frigate' ? 4.6 : 7.4) * KILOMETER,
       strategicMaxSpeed: role === 'frigate' ? 4.6 : 7.4,
       turnRate: role === 'frigate' ? 2.2 : 3.6,
    };
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function getFleetCenter(
    fleet: Fleet,
    nextShipsById: Map<string, ShipDefinition>,
    useSystemPosition: boolean,
): {
    x: number;
    y: number;
    z: number;
} | null {
    const ships = fleet.shipIds
       .map((shipId) => nextShipsById.get(shipId))
       .filter((ship): ship is ShipDefinition => Boolean(ship));

    if (ships.length === 0) {
       return null;
    }

    const sum = ships.reduce(
       (accumulator, ship) => {
          const position = useSystemPosition
                           ? ship.systemPosition
                           : ship.position;

          accumulator.x += position.x;
          accumulator.y += position.y;
          accumulator.z += position.z;
          return accumulator;
       },
       {
          x: 0,
          y: 0,
          z: 0,
       },
    );

    return {
       x: sum.x / ships.length,
       y: sum.y / ships.length,
       z: sum.z / ships.length,
    };
}

function getDistance(
    a: {
       x: number;
       y: number;
       z: number;
    },
    b: {
       x: number;
       y: number;
       z: number;
    },
): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getShipHull(role: ShipRole): number {
    switch (role) {
       case 'frigate':
          return 160;

       case 'carrier':
          return 260;

       case 'constructor':
          return 95;

       case 'fighter':
          return 90;

       case 'scout':
          return 70;
    }
}

function getShipDamage(role: ShipRole): number {
    switch (role) {
       case 'frigate':
          return 18;

       case 'carrier':
          return 14;

       case 'fighter':
          return 10;

       case 'constructor':
          return 3;

       case 'scout':
          return 5;
    }
}

function getStrategicFormationOffset(index: number): {
    x: number;
    y: number;
    z: number;
} {
    const column = index % 3;
    const row = Math.floor(index / 3);

    return {
       x: (column - 1) * 1.2,
       y: 0,
       z: row * 1.4,
    };
}

function getSystemFormationOffset(index: number): {
    x: number;
    y: number;
    z: number;
} {
    const strategic = getStrategicFormationOffset(index);

    return {
       x: strategic.x * KILOMETER,
       y: strategic.y * KILOMETER,
       z: strategic.z * KILOMETER,
    };
}

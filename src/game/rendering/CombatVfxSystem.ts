import * as THREE from 'three';
import type { CombatEvent, ShipDefinition } from '../model/GameWorld';

export type CombatVfxSystemOptions = {
    parent: THREE.Object3D;
    getShipObject: (shipId: string) => THREE.Object3D | null;
};

type ActiveBeam = {
    object: THREE.Line;
    ttl: number;
};

export class CombatVfxSystem {
    private readonly activeBeams: ActiveBeam[] = [];

    constructor(
        private readonly options: CombatVfxSystemOptions,
    ) {}

    trackTargets(
        ships: ShipDefinition[],
        deltaSeconds: number,
    ): void {
        const living = ships.filter((ship) => ship.hull > 0);

        for (const ship of living) {
            const source = this.options.getShipObject(ship.id);

            if (!source || !source.visible) {
                continue;
            }

            let nearest: ShipDefinition | null = null;
            let nearestDistanceSq = Number.POSITIVE_INFINITY;

            for (const candidate of living) {
                if (
                    candidate.id === ship.id ||
                    candidate.factionId === ship.factionId ||
                    candidate.nodeId !== ship.nodeId
                ) {
                    continue;
                }

                const dx = candidate.systemPosition.x - ship.systemPosition.x;
                const dy = candidate.systemPosition.y - ship.systemPosition.y;
                const dz = candidate.systemPosition.z - ship.systemPosition.z;
                const distanceSq = dx * dx + dy * dy + dz * dz;

                if (distanceSq < nearestDistanceSq) {
                    nearest = candidate;
                    nearestDistanceSq = distanceSq;
                }
            }

            if (!nearest || nearestDistanceSq > 18_000 * 18_000) {
                continue;
            }

            const target = this.options.getShipObject(nearest.id);

            if (!target || !target.visible) {
                continue;
            }

            const targetWorld = new THREE.Vector3();
            target.getWorldPosition(targetWorld);
            this.aimTurretsSmooth(source, targetWorld, deltaSeconds);
            this.turnShipTowardTarget(source, targetWorld, deltaSeconds);
        }
    }

    consume(events: CombatEvent[]): void {
        for (const event of events) {
            if (event.type !== 'turret_fire') {
                continue;
            }

            const source = this.options.getShipObject(event.sourceShipId);
            const target = this.options.getShipObject(event.targetShipId);

            if (!source || !target || !source.visible || !target.visible) {
                continue;
            }

            this.aimTurrets(source, target);
            this.createBeam(source, target, event.weaponKind);
        }
    }

    update(deltaSeconds: number): void {
        for (let index = this.activeBeams.length - 1; index >= 0; index--) {
            const beam = this.activeBeams[index];
            beam.ttl -= deltaSeconds;

            if (beam.ttl > 0) {
                continue;
            }

            this.options.parent.remove(beam.object);
            beam.object.geometry.dispose();
            (beam.object.material as THREE.Material).dispose();
            this.activeBeams.splice(index, 1);
        }
    }

    dispose(): void {
        for (const beam of this.activeBeams) {
            this.options.parent.remove(beam.object);
            beam.object.geometry.dispose();
            (beam.object.material as THREE.Material).dispose();
        }

        this.activeBeams.length = 0;
    }

    private aimTurretsSmooth(
        source: THREE.Object3D,
        targetWorld: THREE.Vector3,
        deltaSeconds: number,
    ): void {
        source.traverse((object) => {
            if (object.name !== 'turret_yaw' || !object.parent) {
                return;
            }

            const localTarget = object.parent.worldToLocal(targetWorld.clone());
            const dx = localTarget.x - object.position.x;
            const dz = localTarget.z - object.position.z;
            const desiredYaw = Math.atan2(-dx, -dz);
            const current = object.rotation.y;
            const delta = Math.atan2(
                Math.sin(desiredYaw - current),
                Math.cos(desiredYaw - current),
            );
            const step = Math.min(1, deltaSeconds * 5.5);

            object.rotation.y = current + delta * step;
        });
    }

    private turnShipTowardTarget(
        source: THREE.Object3D,
        targetWorld: THREE.Vector3,
        deltaSeconds: number,
    ): void {
        const currentQuaternion = source.quaternion.clone();
        source.lookAt(targetWorld);
        const desiredQuaternion = source.quaternion.clone();
        source.quaternion.copy(currentQuaternion).slerp(
            desiredQuaternion,
            Math.min(1, deltaSeconds * 1.8),
        );
    }

    private aimTurrets(source: THREE.Object3D, target: THREE.Object3D): void {
        const targetWorld = new THREE.Vector3();
        target.getWorldPosition(targetWorld);

        source.traverse((object) => {
            if (object.name !== 'turret_yaw' || !object.parent) {
                return;
            }

            const localTarget = object.parent.worldToLocal(targetWorld.clone());
            const localOrigin = object.position;
            const dx = localTarget.x - localOrigin.x;
            const dz = localTarget.z - localOrigin.z;

            object.rotation.y = Math.atan2(-dx, -dz);
        });
    }

    private createBeam(
        source: THREE.Object3D,
        target: THREE.Object3D,
        weaponKind: CombatEvent['weaponKind'],
    ): void {
        const start = this.findMuzzleWorldPosition(source);
        const end = new THREE.Vector3();
        target.getWorldPosition(end);

        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({
            color: weaponKind === 'railgun' ? 0xeaf8ff : 0x8fe7ff,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            depthTest: true,
        });
        const line = new THREE.Line(geometry, material);

        line.name = 'CombatBeam';
        line.renderOrder = 30;
        this.options.parent.add(line);
        this.activeBeams.push({
            object: line,
            ttl: weaponKind === 'railgun' ? 0.08 : 0.14,
        });
    }

    private findMuzzleWorldPosition(source: THREE.Object3D): THREE.Vector3 {
        let muzzle: THREE.Object3D | null = null;

        source.traverse((object) => {
            if (!muzzle && object.name === 'muzzle') {
                muzzle = object;
            }
        });

        const position = new THREE.Vector3();
        (muzzle ?? source).getWorldPosition(position);
        return position;
    }
}

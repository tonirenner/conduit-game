import * as THREE from 'three';
import {
	findFirstNodeByKind,
	matchesNamedNodeKind,
} from '@conduit/web3d/assets';
import type { CombatEvent, ShipDefinition } from '../model/GameWorld';

export type CombatVfxSystemOptions = {
    parent: THREE.Object3D;
    getShipObject: (shipId: string) => THREE.Object3D | null;
};

type ActiveBeam = {
    object: THREE.Object3D;
    ttl: number;
};

type ActiveProjectile = {
    object: THREE.Object3D;
    start: THREE.Vector3;
    end: THREE.Vector3;
    age: number;
    ttl: number;
};

export class CombatVfxSystem {
    private readonly activeBeams: ActiveBeam[] = [];
    private readonly activeProjectiles: ActiveProjectile[] = [];

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

            if (usesYawTurret(event.weaponKind)) {
                this.aimTurrets(source, target);
            }

            this.createWeaponEffect(source, target, event.weaponKind);
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
            disposeCombatObject(beam.object);
            this.activeBeams.splice(index, 1);
        }

        for (let index = this.activeProjectiles.length - 1; index >= 0; index--) {
            const projectile = this.activeProjectiles[index];
            projectile.age += deltaSeconds;

            const progress = Math.min(1, projectile.age / projectile.ttl);
            projectile.object.position.lerpVectors(
                projectile.start,
                projectile.end,
                easeOutCubic(progress),
            );

            const direction = projectile.end.clone().sub(projectile.start).normalize();

            if (direction.lengthSq() > 0) {
                projectile.object.quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    direction,
                );
            }

            projectile.object.scale.setScalar(1 + progress * 0.45);

            if (progress < 1) {
                continue;
            }

            this.options.parent.remove(projectile.object);
            disposeCombatObject(projectile.object);
            this.activeProjectiles.splice(index, 1);
            this.createImpact(projectile.end, 0xffc26b);
        }
    }

    dispose(): void {
        for (const beam of this.activeBeams) {
            this.options.parent.remove(beam.object);
            disposeCombatObject(beam.object);
        }

        this.activeBeams.length = 0;

        for (const projectile of this.activeProjectiles) {
            this.options.parent.remove(projectile.object);
            disposeCombatObject(projectile.object);
        }

        this.activeProjectiles.length = 0;
    }

    private aimTurretsSmooth(
        source: THREE.Object3D,
        targetWorld: THREE.Vector3,
        deltaSeconds: number,
    ): void {
        source.traverse((object) => {
            if (!isTurretYawNode(object) || !object.parent) {
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

    private aimTurrets(source: THREE.Object3D, target: THREE.Object3D): void {
        const targetWorld = new THREE.Vector3();
        target.getWorldPosition(targetWorld);

        source.traverse((object) => {
            if (!isTurretYawNode(object) || !object.parent) {
                return;
            }

            const localTarget = object.parent.worldToLocal(targetWorld.clone());
            const localOrigin = object.position;
            const dx = localTarget.x - localOrigin.x;
            const dz = localTarget.z - localOrigin.z;

            object.rotation.y = Math.atan2(-dx, -dz);
        });
    }

    private createWeaponEffect(
        source: THREE.Object3D,
        target: THREE.Object3D,
        weaponKind: CombatEvent['weaponKind'],
    ): void {
        if (weaponKind === 'missile' || weaponKind === 'rocket') {
            this.createMissile(source, target, weaponKind);
            return;
        }

        this.createBeam(source, target, weaponKind);
    }

    private createBeam(
        source: THREE.Object3D,
        target: THREE.Object3D,
        weaponKind: CombatEvent['weaponKind'],
    ): void {
        const start = this.findWeaponOriginWorldPosition(source, weaponKind);
        const end = new THREE.Vector3();
        target.getWorldPosition(end);

        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({
            color: getBeamColor(weaponKind),
            transparent: true,
            opacity: weaponKind === 'railgun' ? 0.88 : 0.70,
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

    private createMissile(
        source: THREE.Object3D,
        target: THREE.Object3D,
        weaponKind: CombatEvent['weaponKind'],
    ): void {
        const start = this.findWeaponOriginWorldPosition(source, weaponKind);
        const end = new THREE.Vector3();
        target.getWorldPosition(end);
        const direction = end.clone().sub(start);
        const distance = direction.length();
        const ttl = THREE.MathUtils.clamp(distance / 36, 0.35, 0.9);
        const projectile = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.ConeGeometry(0.055, 0.26, 12),
            new THREE.MeshBasicMaterial({
                color: 0xffd28f,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
            }),
        );
        const trail = new THREE.Mesh(
            new THREE.ConeGeometry(0.10, 0.55, 12, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0xff7a2c,
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                side: THREE.DoubleSide,
            }),
        );

        body.position.y = 0.12;
        trail.position.y = -0.26;
        trail.rotation.x = Math.PI;
        projectile.name = weaponKind === 'rocket' ? 'CombatRocket' : 'CombatMissile';
        projectile.add(body, trail);
        projectile.position.copy(start);
        projectile.renderOrder = 32;

        if (distance > 0) {
            projectile.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction.normalize(),
            );
        }

        this.options.parent.add(projectile);
        this.activeProjectiles.push({
            object: projectile,
            start,
            end,
            age: 0,
            ttl,
        });
    }

    private createImpact(
        position: THREE.Vector3,
        color: THREE.ColorRepresentation,
    ): void {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            position.clone().add(new THREE.Vector3(-0.16, 0, 0)),
            position.clone().add(new THREE.Vector3(0.16, 0, 0)),
            position.clone().add(new THREE.Vector3(0, -0.16, 0)),
            position.clone().add(new THREE.Vector3(0, 0.16, 0)),
        ]);
        const material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        });
        const impact = new THREE.LineSegments(geometry, material);

        impact.name = 'CombatImpact';
        impact.renderOrder = 33;
        this.options.parent.add(impact);
        this.activeBeams.push({
            object: impact,
            ttl: 0.10,
        });
    }

    private findWeaponOriginWorldPosition(
        source: THREE.Object3D,
        weaponKind: CombatEvent['weaponKind'],
    ): THREE.Vector3 {
        const wantsLauncher = weaponKind === 'missile' || weaponKind === 'rocket';
        const node = findFirstNodeByKind(
            source,
            wantsLauncher ? 'launcherMuzzle' : 'muzzle',
        );

        const position = new THREE.Vector3();
        (node ?? source).getWorldPosition(position);
        return position;
    }
}

function usesYawTurret(weaponKind: CombatEvent['weaponKind']): boolean {
    return weaponKind === 'laser' || weaponKind === 'railgun';
}

function getBeamColor(weaponKind: CombatEvent['weaponKind']): THREE.ColorRepresentation {
    switch (weaponKind) {
        case 'railgun':
            return 0xeaf8ff;
        case 'laser':
            return 0x8fe7ff;
        case 'missile':
        case 'rocket':
            return 0xffc26b;
    }
}

function isTurretYawNode(object: THREE.Object3D): boolean {
    return matchesNamedNodeKind(object, 'turretYaw');
}

function easeOutCubic(value: number): number {
    return 1 - Math.pow(1 - value, 3);
}

function disposeCombatObject(object: THREE.Object3D): void {
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        const material = mesh.material;

        if (Array.isArray(material)) {
            for (const entry of material) {
                entry.dispose();
            }
        } else if (material) {
            material.dispose();
        }
    });
}

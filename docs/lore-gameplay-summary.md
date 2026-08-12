# Lore Gameplay Summary

Source: `docs/Conduit_Lore_Dossier_v0_2.md`  
Date: 2026-08-12

## Core Fantasy

The player is commander of an expedition group during a major human expansion wave around 3030. The central fantasy is not only conquest, but turning unknown or contested systems into visible, functioning parts of civilization.

Main design line:

```text
unknown system
  -> secured foothold
  -> outpost
  -> infrastructure
  -> HQ
  -> developed civilization node
```

Progress should be visible in the world: lights, stations, traffic, defenses, industry, civilian presence, patrols, and resource chains.

## Setting Pillars

Earth is recovering, not destroyed. Heavy industry moved into space over centuries, enabling large-scale restoration of ecosystems.

Humanity is politically advanced but still conflicted. The setting should avoid a clean utopia. Corruption, lobbying, competing interests, separatism, corporate power, and ideological conflict still exist.

Wormholes are natural strategic geography. They create routes, chokepoints, isolated regions, and contested expansion paths. They are not human-built and not fully understood.

AI exists everywhere, but full autonomous authority is restricted after a past AI crisis. AI may analyze, recommend, and assist, but critical decisions, especially military force, require human authorization.

## Player Role

The player controls one expedition command.

Responsibilities:

```text
explore systems
secure hostile space
build sensors and outposts
establish supply
construct stations
build fleets
research technology
defend infrastructure
expand civilization
join PvE/PvP operations with real fleet assets
```

The player's home region should feel like a persistent frontier territory that slowly becomes more stable and valuable.

## System Progression

System development should happen in small visible steps.

Useful progression stages:

```text
Uncharted
Scouted
Contested
Secured
Outpost
Operational
Headquarters
Developed
```

The HQ should be a meaningful threshold. It should only be buildable after hostile ships are cleared from the system. Building the HQ marks the shift from temporary occupation to permanent human presence.

Gameplay implication:

```text
HQ construction requires system security
HQ unlocks advanced production / administration / PvP readiness
```

## PvE Direction

PvE is not a side mode. It is the main long-term system-building loop for players who do not want PvP.

PvE should support:

```text
exploration
resource optimization
system security
station growth
civilian traffic growth
defense networks
NPC events
frontier threats
mission chains
system specialization
```

PvE and PvP share the same persistent foundation: build, secure, develop, and risk real assets.

## PvP Direction

PvP is unlocked later, tied to stronger infrastructure such as the Large Shipyard. This makes PvP feel like a serious military operation rather than an immediate menu mode.

PvP uses real persistent ships. Destroyed ships are removed from the player's persistent fleet inventory.

Match rules should limit deployed strength:

```text
max fleet value
max ship count
allowed ship classes
capital ship restrictions
research tier caps
scenario-specific constraints
```

Progression should create options, not automatic victory.

## Persistent Losses

Persistent ship loss is lore-compatible and design-critical.

Battle result flow:

```text
selected persistent fleet
  -> PvE/PvP operation
  -> BattleResult
  -> destroyed ships removed from persistent state
  -> survivors return
  -> rewards applied
```

Long-term this must be server-authoritative or server-validated.

## Factions And Conflict Seeds

The dossier does not lock final factions yet, but it gives strong conflict sources:

```text
federal expansion authority
industrial consortiums
military expedition command
scientific groups
corporate mining interests
separatist colonies
religious hardliners
anti-expansion movements
frontier settlers
autonomous habitats
unknown external threats
```

Good early NPC roles:

```text
expedition liaison
shipyard director
research officer
logistics officer
security commander
civilian administrator
corporate representative
AI tactical advisor with limited authority
```

## Resource And Economy Hooks

The economy should reflect the setting: heavy industry, logistics, orbital production, and resource rights matter.

Initial resource model can stay simple:

```text
credits
metal
rareMaterials
fuel
researchPoints
```

Later expansions:

```text
water
volatiles
fusion fuel
habitat capacity
industrial capacity
civilian stability
environmental pressure
corporate influence
```

## Technology Hooks

Research should feel like expedition capability growth, not generic RPG leveling.

Good early tech categories:

```text
sensors
ship construction
station modules
defense systems
refinery efficiency
engine upgrades
armor
weapon systems
logistics
AI-assisted command
wormhole analysis
```

AI research should respect the lore constraint: better analysis and automation support, but not unrestricted autonomous military authority.

## UI And World Feedback

The UI should reinforce that the player is managing a frontier command.

Useful world feedback:

```text
system status: unknown / contested / secured / developed
security level
infrastructure level
traffic level
civilian presence
industrial output
sensor coverage
threat level
HQ readiness
```

Avoid making progression only a number. Each upgrade should ideally produce a visible or audible world change.

## Immediate Game Implications

Near-term implementation targets that align strongly with the lore:

```text
HQ station as system-secure milestone
system status model
fog of war / sensor coverage
visible outpost-to-HQ progression
resource production tied to planets
research as expedition capability
PvE missions for securing systems
persistent fleets used by optional PvP/PvE lobbies
real ship losses from operations
```

## Open Design Questions

Still intentionally undefined:

```text
exact Earth government structure
Mars status
corporate power boundaries
who owns expedition-built HQs
wormhole discovery history
FTL communication limits
artificial gravity rules
terraforming status
alien life status
details of the AI crisis
```

These should remain flexible until they are needed for concrete gameplay, missions, or UI.

## Design Summary

Conduit should feel like building a real frontier civilization from fragile first presence to established interstellar infrastructure.

The key experience is:

```text
I secured this system.
I built this infrastructure.
These ships are mine.
These losses matter.
This region changed because of my decisions.
```

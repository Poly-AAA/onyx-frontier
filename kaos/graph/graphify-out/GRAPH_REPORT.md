# Graph Report - graph  (2026-11-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 657 nodes · 1280 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22

## God Nodes (most connected - your core abstractions)
1. `mulberry32()` - 23 edges
2. `recomputeVitals()` - 20 edges
3. `boot()` - 17 edges
4. `clamp()` - 16 edges
5. `update()` - 15 edges
6. `createCity()` - 14 edges
7. `createHero()` - 14 edges
8. `simulateRun()` - 14 edges
9. `chebyshev()` - 13 edges
10. `buildEncounter()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `say()` --calls--> `clock()`  [EXTRACTED]
  src/ui.js → src/game.js
- `esbuild@^0.28.2` --declares--> `esbuild`  [EXTRACTED]
  ow/package.json → package.json
- `say()` --calls--> `talk()`  [EXTRACTED]
  src/ui.js → src/ai/dialogue.js
- `rewardMission()` --calls--> `gainXp()`  [EXTRACTED]
  src/combat/bridge.js → src/core/roguelite.js
- `createBrawl()` --calls--> `unlockedSpells()`  [EXTRACTED]
  src/combat/brawl.js → src/core/roguelite.js

## Import Cycles
- None detected.

## Communities (23 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (58): ACTIONS, buildPrompt(), fetchT(), MOODS, offlineReply(), probeRemote(), sanitizeReply(), talk() (+50 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (58): castOn(), chooseAndAct(), leaderFade(), nearest(), occupied(), spellForLevel(), stepAway(), stepToward() (+50 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (35): buildBody(), createCamera(), st, createPlayer(), st, createWalker(), dress(), CHUNK (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (42): remoteAvailable(), currentStep(), CATALOG, equip, heal(), healPrice(), itemScore, recomputeVitals (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (40): enum, maximum, minimum, type, type, enum, type, items (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (39): author, dependencies, @dimforge/rapier3d-compat@^0.21.0, three@^0.187.0, description, devDependencies, esbuild@^0.28.2, terser@^5.51.4 (+31 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (34): addJobXp(), BALANCE, CHALLENGES, COMPAT, CORE_STATS, crush(), ELEMENT_STAT, findItem() (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (31): type, enum, items, type, type, properties, type, type (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (31): type, type, type, properties, type, type, type, type (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (28): type, items, type, type, properties, type, type, items (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (23): ctx, cv, g, params, diamond(), DIR_ROW, drawBuilding(), drawChar() (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (23): const, type, items, type, properties, type, type, type (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (21): type, type, type, const, additionalProperties, description, type, const (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (14): createEngine(), particles(), puff(), skyTexture(), toonRamp(), chantierTexture(), createCity(), chantier() (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (20): acceptanceChance(), bindLook(), buildEncounter(), clamp(), craft(), createHero(), createItem(), gainAmount() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (16): newGameState(), aiPolicy(), applyHeal(), attachCatalog(), buy(), createMeta(), createState(), equip() (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.26
Nodes (15): createBrawl(), makeFoe(), fightNpc(), challengeSuccess(), finishDeath(), gainXp(), gradeOf(), recomputeVitals() (+7 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (13): cols, frame, looks, brute, cop, doc, ghost, nova (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (4): wasmOut, bucket, PROVIDERS, TYPES

### Community 20 - "Community 20"
Cohesion: 0.36
Nodes (9): cast(), dmgOf(), end(), FOE_DMG, hitFoe(), nearest(), RADIUS, STAT (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.28
Nodes (9): applyLine(), effectiveStats(), emptyBase(), emptyRes(), equippedItems(), fighterFrom(), powerScore(), setBonuses() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.39
Nodes (8): cloneSpell(), handmadeKit(), isHandmadeSpell(), pickKit(), prepareCatalog(), specialSpells(), syncHeroSpells(), tagSpell()

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `Community 5` to `Community 13`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06971153846153846 - nodes in this community are weakly interconnected._
- **Why does `createEngine()` connect `Community 13` to `Community 2`, `Community 5`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07597895967270601 - nodes in this community are weakly interconnected._
- **Why does `mulberry32()` connect `Community 17` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 10`, `Community 14`, `Community 16`, `Community 20`, `Community 22`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0803633822501747 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09863945578231292 - nodes in this community are weakly interconnected._
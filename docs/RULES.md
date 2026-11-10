# LaXis & OnAllies — Rulebook

*A two-player area-control war game for La Crosse and Onalaska, Wisconsin, with a zombie outbreak closing in from the bluffs.*

**Players:** 2 (La Crosse vs. Onalaska), and the loser keeps playing as the zombies
**Time:** 60–120 minutes
**Inspired by:** classic WWII area-control games. If a situation is not covered here, use standard Axis & Allies conventions.

---

## 1. Object of the game

**Win** by controlling **every territory inside the wall**, meaning every neighborhood of La Crosse, Onalaska and French Island, with **no zombies anywhere inside the wall**, and by **holding that for a full round**.

- If you meet this condition at the end of your turn, announce "**The cities are ours.**"
- If you still meet it at the start of your next turn, after your opponent's turn and the zombie turn have passed, **you win**.

Territories **outside the wall** (Holmen, Brice Prairie, the southern bluffs, etc.) give income but are **not** needed to win.

## 2. Components

| Component | Count (print sheet) | Notes |
|---|---|---|
| Game board | 1 | Neighborhood-shaped territories built from OpenStreetMap data |
| La Crosse units (red) | 30 infantry, 10 tanks, 1 Gundersen Helicopter | |
| Onalaska units (blue) | 30 infantry, 10 tanks, 1 Plane | |
| Zombie units (green) | 50 | |
| Wall pieces | one per wall segment on the board | Flip or remove when destroyed |
| Control markers | 2 × 40 | Mark who owns a territory |
| Supply (SP) and Oil tracks | 1 each per player | Use the tracker sheet or coins |
| Six-sided dice | 10+ | |

Stacks of identical units can be marked with "×5" chips, as in Axis & Allies.

## 3. The board

- **Territories** follow real neighborhoods and municipal lines. Each territory shows:
  - its **income value** (Supply Points, SP),
  - a **fuel pump icon** for each **Kwik Trip** in it (each one gives **1 oil** per turn),
  - a **zombie road arrow** (outside the wall, and most territories inside it) showing which way automatic zombies walk,
  - a **spawn number 1–6** on the six outer road-entry territories (north, east and south of the cities).
- **Inside the wall:** La Crosse (red border), Onalaska (blue border) and French Island (neutral, grey).
- **Outside the wall:** everything else. These are income territories that are exposed to the horde.
- **The wall** runs along every land border (and every bridge) between an inside territory and an outside territory. **There is no wall between La Crosse and Onalaska.** The Mississippi River on the west needs no wall, because zombies cannot cross open water.
- **Water** (the Mississippi, Black River, La Crosse River marsh and Lake Onalaska) blocks movement. Territories on opposite banks are adjacent only where a **bridge** connects them; bridges are drawn on the board.
- **Special territories**
  - **City Halls:** Downtown La Crosse and Downtown Onalaska. New units are placed here. Lose yours and you lose the game (§10).
  - **Airport:** La Crosse Regional Airport on French Island. Whoever controls it can buy and fly aircraft.
  - **Gundersen:** the hospital campus in La Crosse. It is the Gundersen Helicopter's home helipad.

## 4. Setup

1. Place the starting units shown on the board (or in the setup table printed on the reference sheet).
2. Place a control marker on each La Crosse territory (red) and each Onalaska territory (blue). French Island and all outside territories start **unowned**.
3. Place a wall piece on every wall segment.
4. Each player starts with **SP equal to their income** and **2 oil**.
5. *Optional, "Outbreak" variant:* place 1 zombie on each spawn territory.
6. La Crosse goes first.

## 5. Sequence of play

A **round** is:

1. **La Crosse turn**
2. **Onalaska turn**
3. **Zombie turn**

Each player turn has these phases, in order (as in Axis & Allies):

1. **Purchase units**: spend SP. Purchased units wait off-board.
2. **Combat move**: move units into hostile territories (enemy units or zombies) and into empty territories you want to capture.
3. **Conduct combat**: first **wall fire** (§7), then resolve each battle.
4. **Noncombat move**: units that did not move or fight this turn may move into friendly territory. Aircraft must land.
5. **Mobilize** new units.
6. **Collect income**: SP and oil from every territory you **control**.

### Control

You **control** a territory if your control marker is on it **and it contains no zombies and no enemy units.** A territory overrun by zombies keeps its control marker but **produces nothing** until it is cleared.

## 6. Units

Combat uses the Axis & Allies system: a unit **hits on a d6 roll equal to or below** its number.

| Unit | Cost | Attack | Defense | Move | Special |
|---|---|---|---|---|---|
| Infantry | 3 | 1 | 2 | 1 | |
| Tank | 6 | 3 | 3 | 2 | **Costs 1 oil to move** each turn; can blitz |
| Gundersen Helicopter (La Crosse only) | 10 | 2 | 3 | 3 | Carries 1 infantry; lands at Gundersen or the Airport |
| Plane (Onalaska only) | 10 | 4 | 2 | 4 | Lands at the Airport |
| Zombie | — | 3 | 2 | 1 | Cannot cross an intact wall; never retreats |

### Oil and tanks
- Moving a tank costs **1 oil** the first time it moves in a turn (either move phase). Tanks without oil stay put, but they still defend and can fire from the wall.
- At **Collect Income**, gain **1 oil for each Kwik Trip** in territories you control.

### Blitzing
During combat move, a tank may move through an **empty** unowned or enemy territory and keep going. It captures that territory on the way.

### Aircraft and the Airport
- You can **buy** your aircraft only while you **control the Airport**. Each side may have **at most one** aircraft at a time; if yours is destroyed, you may buy another.
- You can **fly** your aircraft only while you control the Airport. If you lose the Airport, your aircraft is **grounded**: it cannot move, but it still defends.
- New aircraft are placed at their landing site (the helicopter goes to Gundersen if you control it, otherwise to the Airport).
- At the end of your Noncombat Move, any aircraft that moved this turn and is **not on a landing site you control is destroyed** (it crashed). Landing sites are the **Airport** for both aircraft, plus **Gundersen** for the helicopter.
- Aircraft cannot capture territory. Aircraft may fly over anything, including water, enemies and zombies.
- **Helicopter transport:** the helicopter may carry **one infantry** that has not moved this turn. Both move together using the helicopter's movement, and the infantry is dropped where the helicopter ends.

## 7. The wall

- The wall keeps zombies out. **Your units pass through it freely**, because there are gates.
- **Zombies cannot cross an intact wall segment.**
- **Breaching takes zombies two turns:**
  1. Zombies **arrive** in an outside territory next to the wall.
  2. On the **next** zombie turn, instead of moving, they **tear down** that wall segment. Remove the wall piece.
  3. On the zombie turn **after that**, they can **move through** the gap.
- **Destroyed walls can never be rebuilt.**

### Wall fire (fortified units)
At the start of **Conduct Combat**, each inside territory that you own and that has a land unit **which did not move this turn** is **fortified**.

- Fortified units in a territory may fire **one volley** across an **intact** wall segment at zombies in the adjacent outside territory. Each unit rolls once, using its **Defense** value (infantry hit on 1–2, tanks on 1–3).
- Each hit removes one zombie. **Zombies do not fire back.**
- If a territory borders more than one zombie-filled outside territory, choose **one** target per territory per turn.
- Once a wall segment is torn down, nobody can fire across it. To fight those zombies you must **move into their territory** and battle them normally.

## 8. Combat

### Player vs. player
Standard Axis & Allies land combat:
1. Attacker rolls for every attacking unit; defender rolls for every defending unit.
2. Each side removes casualties equal to the hits scored. Each owner chooses which of their own units die (default: cheapest first).
3. The attacker may **retreat** after any round. All surviving attackers move together to **one** friendly territory from which attacking units came.
4. Continue until one side is gone or the attacker retreats. If attacking land units survive, the attacker takes control.

Casualties in player-vs-player fights are simply removed. They **do not** become zombies.

### Attacking zombies
Same procedure as above, with zombies defending at **2**.
- **If you win**, your casualties are removed as usual, and they stay dead.
- **If you retreat, or your attacking force is wiped out**, every land unit you lost in that battle **rises as a zombie** in that territory.

### Zombies attacking you
During the zombie turn, zombies that enter a territory with player units attack (zombies hit on **3**, your units defend normally). Zombies **never retreat**, and you cannot retreat while defending. The battle continues until one side is gone.
- **If the zombies win** (all your units there are destroyed), every land unit you lost **rises as a zombie** in that territory.
- **If you hold**, your casualties stay dead.
- Aircraft that are destroyed are simply removed. They never rise.

## 9. The zombie turn

1. **Shamble**: move every zombie stack (see below).
2. **Spawn**: roll **round ÷ 2 dice, rounded up** (round 1: 1 die; round 2: 1 die; round 3: 2 dice; round 6: 3 dice …). **Each 6 creates one zombie.** For each new zombie, roll another die for its **spawn point (1–6)** and place it there. New zombies do not move until the next zombie turn.
3. **Feast**: resolve every battle where zombies share a territory with player units (§8).

### Automatic zombies (while both players are alive)
Each zombie stack moves **one territory**, following the **road arrow** printed in its territory. The arrows follow the main highways (I-90, US-53, WI-16, WI-35, WI-33, US-14/61, WI-157) toward the nearest downtown.
- If the arrow points across an **intact wall**, the stack **tears it down** instead of moving.
- If a territory shows **two arrows**, roll a die: 1–3 takes the first arrow, 4–6 the second.
- A stack in a **City Hall** territory (the end of the road) moves into the adjacent territory, not behind an intact wall, that holds the **most player units** (roll to break ties). If no adjacent territory holds player units, it stays where it is.
- Zombies do not chase units off their road. They will walk straight into whatever stands in their way.

### Controlled zombies (after a player falls)
Once a player is defeated, **that player commands the zombie horde** for the rest of the game:
- Move each zombie **up to 1 territory in any direction** (you may split stacks), never across an intact wall.
- Instead of moving, zombies that **did not move this turn** and are next to an intact wall segment may **tear it down**.
- Spawning stays random (dice), as above.
- **The zombie player wins** if the remaining human player is also defeated.

## 10. Defeat

At the **end of your own turn**, you are **defeated** if:
- you do not **control** your City Hall (it is held by your enemy or overrun by zombies), or
- you have **no land units** on the board.

When you are defeated:
- **All of your remaining land units turn into zombies** where they stand. Your aircraft are destroyed.
- All of your control markers are removed. Those territories become unowned.
- Your SP and oil are lost.
- **You now control the zombies** (§9).

The survivor still has to meet the victory condition in §1, which means retaking every inside neighborhood and clearing every zombie inside the wall. If **both** players fall, the zombies win.

## 11. Quick reference

```
ROUND:  La Crosse → Onalaska → Zombies
TURN:   Purchase → Combat Move → Combat (wall fire first) → Noncombat Move → Mobilize → Income
ZOMBIE: Shamble (or smash wall) → Spawn (ceil(round/2) dice, each 6 = zombie, roll spawn point) → Feast
HIT:    roll ≤ value.   Zombies A3 D2 M1.   Infantry 3 SP A1 D2 M1.   Tank 6 SP A3 D3 M2 (1 oil).
        Helicopter (LAX) 10 SP A2 D3 M3 carries 1 inf.   Plane (ONA) 10 SP A4 D2 M4.
WALL:   arrive → next zombie turn smash → next zombie turn enter.  Never rebuilt.
        Fortified (didn't move) units fire once per turn at Defense value, no return fire.
RISE:   units you lose when zombies beat you, or when you attack zombies and lose or retreat.
WIN:    own every inside territory, zero zombies inside, at end of your turn AND start of your next.
LOSE:   end your turn without your City Hall (or with no land units). Then you run the horde.
```

## 12. Designer's notes and defaults

These rules were set from the designer's brief. The choices below were filled in by default and are easy to change:

- **Fortified fire uses Defense value** (infantry 2, tank 3), not Attack, so that a line of infantry on the wall is worth something. To use Attack instead, play with infantry hitting on 1. The digital version has a setting for this.
- **Tank crews rise as zombies** like infantry. Aircraft never rise.
- **Defeated players' surviving units become zombies.** This gives the new zombie commander a real force.
- **One aircraft per side**, and both need the Airport to buy or fly.
- **The zombie spawn rate starts low** (expected zombies per round = dice ÷ 6). If games feel too calm early, use the Outbreak variant (§4).

---
name: generate-survival-tables
description: Generate d20 survival tables (Encounters, Threats, Resources, Food Sources) for a given campaign theme and world environment. Prompts the user for theme and setting before generating.
---

# Generate Survival Tables

Generate four d20 roll tables for the road-to-survival game based on a campaign theme and world environment chosen by the user.

## Step 1 — Gather inputs

Use `AskUserQuestion` to prompt for both inputs at once:

**Question 1 — Theme**
Ask: "What is the campaign theme?"
Header: "Theme"
Suggest these options (allow Other for custom input):
- Vampire — undead lords, gothic horror, blood magic
- Fey — enchanted forests, trickster spirits, wild magic
- Plague — disease, corruption, desperate survivors
- Elemental — storms, volcanic, flooding, or frozen wilderness

**Question 2 — World Environment**
Ask: "What is the world environment / setting?"
Header: "Environment"
Suggest these options (allow Other for custom input):
- Gothic Eastern Europe — castles, dense forest, fog-shrouded villages
- Enchanted Forest — ancient woods, fey ruins, glowing flora
- Ruined City — collapsed buildings, underground tunnels, scavenger gangs
- Frozen Tundra — blizzards, ice caves, isolated settlements

## Step 2 — Generate all 4 tables

Using the theme and environment chosen, generate all four tables. Follow every rule below precisely.

### Rules

**Skill → Outcome Type mapping (fixed, never change this):**

| Skill | Outcome Type |
|-------|-------------|
| Animal Handling | Encounter |
| Deception | Encounter |
| Insight | Encounter |
| Intimidation | Encounter |
| Performance | Encounter |
| Persuasion | Encounter |
| Acrobatics | Threat |
| Athletics | Threat |
| Perception | Threat |
| Religion | Threat |
| Stealth | Threat |
| Arcana | Resource |
| History | Resource |
| Investigation | Resource |
| Sleight of Hand | Resource |
| Medicine | Food |
| Nature | Food |
| Survival | Food |

**d20 tier structure (same for every table):**

| Roll | Tier |
|------|------|
| 16–20 | Easiest / safest / most abundant outcome |
| 11–15 | Good outcome with minor complications |
| 6–10 | Viable but risky or low yield |
| 1–5 | Desperate, dangerous, or barely viable |

Higher rolls = better outcomes. Lower rolls = harder, riskier, or leaner.

**Within each tier: provide 4–5 distinct options.** The GM or a secondary roll picks among them. Options within the same tier should be roughly equivalent in difficulty/reward but distinct in flavour.

**Tone and content rules:**
- Every scenario must be specific and evocative — not generic
- Scenarios must reflect both the theme AND the environment together
- Food sources must reflect what the players' characters would actually eat or consume given the theme (e.g. vampires feed on living beings, not plants)
- Threats must be immediate physical or environmental dangers, not social ones
- Encounters must involve a being or group that can be interacted with
- Resources must be tangible items or information the party can carry or use

### Output format

Output all four tables in sequence. Use this exact format for each:

```
## [Table Name] — [Skill Category]

*Brief one-line description of what this skill represents in the context of the theme.*

**16–20 — [Tier label]**
- Scenario one
- Scenario two
- Scenario three
- Scenario four
- Scenario five

**11–15 — [Tier label]**
- ...

**6–10 — [Tier label]**
- ...

**1–5 — [Tier label]**
- ...
```

The four tables to generate, in order:
1. **Encounters** — cover all 6 Encounter skills, each as its own sub-table under the Encounters header
2. **Threats** — cover all 5 Threat skills, each as its own sub-table
3. **Resources** — cover all 4 Resource skills, each as its own sub-table
4. **Food Sources** — cover all 3 Food skills, each as its own sub-table

Each sub-table is headed by the skill name and its governing ability score, e.g. `### Animal Handling (WIS)`.

## Step 3 — Offer to save

After generating all tables, ask the user if they want the tables saved to a markdown file. If yes, save to:

```
games/road-to-survival/content/survival-tables/<theme-slug>-<environment-slug>.md
```

Use kebab-case for the filename. Include the theme and environment as frontmatter at the top of the file:

```md
---
theme: <theme>
environment: <environment>
generated: <today's date>
---
```

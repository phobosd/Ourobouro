# Admin Dashboard Guide

The Admin Dashboard is the control center for the Zenith-9 game world. It allows administrators to manage the AI Director, oversee content generation, configure guardrails, and manipulate the game state in real-time.

## Table of Contents
1. [Architecture](#architecture)
2. [Features & Usage](#features--usage)
    - [1. Director Control](#1-director-control)
    - [2. Guardrails & Budgets](#2-guardrails--budgets)
    - [3. Content Approvals](#3-content-approvals)
    - [4. LLM Configuration](#4-llm-configuration)
    - [5. World Map (Expansions)](#5-world-map-expansions)
    - [6. Item & NPC Management](#6-item--npc-management)
    - [7. Snapshots](#7-snapshots)
    - [8. Logs](#8-logs)
    - [9. World Events & Bosses](#9-world-events--bosses)
    - [10. Loot System](#10-loot-system)
3. [Autonomous Operations](#11-autonomous-operations)
    - [The Automation Loop](#the-automation-loop)
    - [Personality-Driven Logic](#personality-driven-logic)
    - [The Approval Workflow](#the-approval-workflow)
    - [Persistence](#persistence)

## Architecture

The Zenith-9 system integrates Large Language Models (LLMs) into the core game loop through a "World Director" system. This system acts as an intermediary between the raw creativity of the LLM and the strict rules of the game engine.

```mermaid
graph TD
    subgraph "Client"
        Admin[Admin Dashboard]
        Game[Game Client]
    end

    subgraph "Server"
        Director[World Director]
        Guardrails[Guardrail Service]
        Publisher[Publisher Service]
        Engine["Game Engine (ECS)"]
        
        subgraph "Generators"
            NPCGen[NPC Generator]
            ItemGen[Item Generator]
            QuestGen[Quest Generator]
            RoomGen[Room Generator]
        end
        
        LLM[LLM Service]
    end

    subgraph "External"
        AI["LLM Provider (Gemini/Local)"]
    end

    Admin -->|Socket.IO| Director
    Director -->|Config| Guardrails
    Director -->|Prompts| Generators
    Generators -->|Context| LLM
    LLM -->|Raw JSON| Generators
    Generators -->|Proposal| Director
    Director -->|Review| Admin
    Admin -->|Approve| Director
    Director -->|Publish| Publisher
    Publisher -->|Entities| Engine
    Engine -->|State Updates| Game
```

## Features & Usage

### 1. Director Control
The main "Director" tab provides high-level control over the AI's autonomy.

![Director Control Dashboard](assets/admin_dashboard_main.png)

*   **Emergency Stop / Resume**: A large toggle button to instantly pause or resume all automated generation loops. Use this if the AI starts generating undesirable content.
*   **Personality Settings**: Adjust the "Personality" of the Director.
    *   **Chaos**: Influences the randomness and unpredictability of events.
    *   **Aggression**: Determines the hostility of generated NPCs and the danger level of quests.
    *   **Expansion**: Controls how frequently the world grows (new rooms/chunks).
*   **Manual Triggers**: Buttons to force the immediate generation of specific content (NPC, Mob, Item, Quest, Expansion) regardless of the current automation timer.
    *   **WORLD_EXPANSION**: Generates a new room at a random location (0-100).
    *   **Create BOSS**: Generates a high-threat entity with boosted stats and guaranteed legendary loot.
    *   **World Event**: Triggers a global event (e.g., Mob Invasion) that affects the entire world.

### 2. Guardrails & Budgets
This section defines the strict limits within which the AI must operate.

*   **Feature Toggles**: Enable or disable specific types of generation (e.g., turn off "Enable Expansions" to stop the map from growing).
*   **Budgets**: Numerical limits for game balance.
    *   *Example*: Setting `Max Weapon Damage` to 50 ensures the AI never creates a "God Slayer Sword" with 1000 damage, even if it writes a cool description for it.
    *   *Usage*: Click on a budget value to edit it.

### 3. Content Approvals
When `Require Human Approval` is enabled, all AI-generated content appears here as a "Proposal" before entering the game.

*   **Review**: Read the Name, Description, and Rationale provided by the AI.
*   **Approve**: Click the green checkmark to publish the content to the live game.
*   **Reject**: Click the red X to discard the proposal.

### 4. LLM Configuration
Manage the connections to Large Language Models.

![LLM Configuration](assets/admin_dashboard_llm.png)

*   **Profiles**: Create different profiles for different tasks (e.g., a "Creative" profile using GPT-4 for descriptions, and a "Logic" profile using a local Llama-3 model for stats).
*   **Roles**: Assign roles (Creative, Logic, Default) to specific profiles to optimize cost and performance.

### 5. World Map (Expansions)
A visual grid representing the game world.

*   **Navigation**: The grid shows generated chunks (green).
*   **Manual Generation**: Click any empty cell to force the AI to generate a new room/chunk at that location.
*   **Deletion**: Toggle "Delete Mode" and click a green cell to permanently delete that chunk and its contents.

### 6. Item & NPC Management
Direct access to the game's registries.

![Item Registry](assets/admin_dashboard_items.png)
![NPC Registry](assets/admin_dashboard_npcs.png)

*   **Items / NPCs Tabs**: View a list of all currently loaded items and NPCs.
*   **Search**: Filter the list by name or type.
*   **Delete**: Remove an entity from the game. *Note: This deletes the definition, so new instances cannot be spawned, but existing instances in the world may persist until a restart.*

### 7. Snapshots
Manage world state backups.

*   **Create Snapshot**: Save the current state of all entities (players, items, rooms) to a file.
*   **Restore**: Rollback the world to a previous state. *Warning: This overwrites current progress.*
*   **Auto-Snapshot**: If enabled in Guardrails, the system will automatically create snapshots before high-risk operations (like large map expansions).

### 8. Logs
A real-time feed of system events.

### 9. Director's Inner Thoughts
Located at the bottom of the Director tab, this section provides real-time transparency into the AI's autonomous decision-making process.
*   **Decision Logic**: See the exact rolls and thresholds for Aggression, Expansion, and Chaos checks.
*   **Status Updates**: Monitor why the Director chose to skip an action (e.g., "No suitable expansion spots found").
*   **Transparency**: Useful for debugging personality settings and ensuring the AI is operating as expected.

### 10. World Events & Bosses
The Director can orchestrate large-scale events and generate powerful adversaries to challenge players.

*   **World Events (Mob Invasion)**:
    *   **Trigger**: Can be triggered manually via the "World Event" button or automatically by the Director based on the **Aggression** personality trait.
    *   **Effect**: Spawns 10-20 aggressive mobs in random locations across the world.
    *   **Loot**: Invasion mobs have a 20% chance to carry `RARE` grade items.
    *   **System Alerts**: The system broadcasts a global warning to all players when an invasion begins.
*   **Bosses**:
    *   **Trigger**: Manual trigger via the "Create BOSS" button.
    *   **Scaling**: Bosses are automatically scaled to **5x Health** and **2x Attack/Defense** compared to standard NPCs.
    *   **Loot**: Bosses are guaranteed to drop at least one `LEGENDARY` item.
    *   **Approval**: Bosses create a **Proposal** that must be reviewed and approved by an admin before they are published to the registry.
*   **Auto-Approval**: World Event mobs (Invasions) bypass the approval queue for immediate impact.

### 10. Loot System
All NPCs (including Bosses and Invasion Mobs) now participate in a dynamic loot system.
*   **On Death**: When an NPC is defeated, it drops all items in its inventory (hands and equipment) and any items defined in its `Loot` component onto the ground.
*   **Visibility**: A message is broadcast to the attacker when loot is dropped.

### 12. Autonomous Operations

The World Director is designed to operate autonomously when **Resumed**, driving the game's narrative and world growth without constant manual intervention.

#### The Automation Loop
The Director runs a background "Automation Loop" every 10 seconds. During each tick, it evaluates the current game state and its own **Personality Traits** to decide if it should take action.

#### Personality-Driven Logic
The probability of autonomous actions is scaled by the sliders in the **Director Personality** card:
*   **Expansion (Autonomous World Growth)**:
    *   **Logic**: If enabled, the Director periodically attempts to grow the map.
    *   **Connected Expansion**: To ensure the world remains navigable, the Director uses "Adjacency Logic." It scans the live game engine for existing rooms and only proposes new rooms in empty coordinates immediately adjacent (North, South, East, or West) to an existing room.
    *   **End-of-Map Growth**: This ensures the city grows outwards from its current "ends" rather than appearing in disconnected clusters.
*   **Aggression (Autonomous Threats)**:
    *   **Logic**: High aggression increases the chance of the Director triggering random world events, such as Mob Invasions or spawning elite patrols near active players.
*   **Chaos (Autonomous Anomalies)**:
    *   **Logic**: Influences the "weirdness" of generated content and the frequency of unexpected glitches or environmental shifts.

#### The Approval Workflow
Even when operating autonomously, the Director is subject to **Guardrails**:
*   **Proposals**: If `Require Approval` is enabled, autonomous rooms, NPCs, and items will appear in the **Approvals** tab as drafts. They only enter the live game once an admin clicks **Approve & Publish**.
*   **Auto-Publishing**: If `Require Approval` is disabled, the Director will publish its creations directly to the game engine, allowing for a truly "living" and ever-changing world.

#### Persistence
All Director settings are persistent. The following are saved to `data/director_config.json` and survive server reboots:
*   **Operational State**: Whether the Director was Paused or Resumed.
*   **Personality Sliders**: The exact values and enabled/disabled status of Chaos, Aggression, and Expansion.
*   **Glitch Configuration**: Settings for mob counts and legendary drop rates.


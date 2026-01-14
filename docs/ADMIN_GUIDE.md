# Admin Dashboard Guide

The Admin Dashboard is the control center for the Ouroboro game world. It allows administrators to manage the AI Director, oversee content generation, configure guardrails, and manipulate the game state in real-time.

## Architecture

The Ouroboro system integrates Large Language Models (LLMs) into the core game loop through a "World Director" system. This system acts as an intermediary between the raw creativity of the LLM and the strict rules of the game engine.

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

*   **Emergency Stop / Resume**: A large toggle button to instantly pause or resume all automated generation loops. Use this if the AI starts generating undesirable content.
*   **Personality Settings**: Adjust the "Personality" of the Director.
    *   **Chaos**: Influences the randomness and unpredictability of events.
    *   **Aggression**: Determines the hostility of generated NPCs and the danger level of quests.
    *   **Expansion**: Controls how frequently the world grows (new rooms/chunks).
*   **Manual Triggers**: Buttons to force the immediate generation of specific content (NPC, Mob, Item, Quest, Expansion) regardless of the current automation timer.

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

*   **Profiles**: Create different profiles for different tasks (e.g., a "Creative" profile using GPT-4 for descriptions, and a "Logic" profile using a local Llama-3 model for stats).
*   **Roles**: Assign roles (Creative, Logic, Default) to specific profiles to optimize cost and performance.

### 5. World Map (Expansions)
A visual grid representing the game world.

*   **Navigation**: The grid shows generated chunks (green).
*   **Manual Generation**: Click any empty cell to force the AI to generate a new room/chunk at that location.
*   **Deletion**: Toggle "Delete Mode" and click a green cell to permanently delete that chunk and its contents.

### 6. Item & NPC Management
Direct access to the game's registries.

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

*   **Usage**: Monitor this feed to see what the Director is "thinking," track errors, and verify that content is being published successfully.

# Ouroboro

A cyberpunk-themed MUD (Multi-User Dungeon) with an innovative **Neural Pulse** timing-based combat system.

## 🎮 Features

### Core Gameplay
- **Persistent World**: 20x20 procedurally generated cyberpunk city
- **Real-time Multiplayer**: WebSocket-based server with Redis persistence
- **Entity Component System (ECS)**: Optimized with component indexing for high-performance queries
- **Structured Messaging**: Type-safe JSON protocol for rich client-side rendering
- **Input Validation**: Zod-powered schema validation for all network events
- **Robust Persistence**: Redis-backed state management with complex object reconstruction
- **Rich Inventory System**: Hands, equipment slots, and container management
- **Character Stats**: Attributes (STR, AGI, CON, INT, CHA) and Skills (Marksmanship, Hacking, etc.)

### 🎯 Neural Pulse Combat System
Revolutionary timing-based combat with client-side rendering for zero-lag responsiveness:

- **Animated Sync Bar**: Real-time ASCII cursor movement
- **Skill-Based Timing**: Press `F` to fire when cursor hits your target zone
- **Three Hit Types**:
  - **[==] CRIT ZONE** - 2x damage + System Breach effect
  - **[|] HIT MARKERS** - Normal damage
  - **[-] MISS ZONE** - No damage
- **System Breach Effects**: 5 unique critical effects (Neural Feedback, Optic Glitch, Armor Shred, etc.)
- **Dynamic Difficulty**: Scales with player Agility and Skill Level
- **Combat Flow & Momentum**: Accumulate momentum through successful strikes to reach "Peak" state and unleash devastating techniques like Iaijutsu.
- **Consumables System**: Use medkits, stimpacks, and other items to manage health, fatigue, and balance in real-time.

### World & NPCs
- **Diverse Zones**: Streets, plaza, shops, clinic, nightclub, park
- **Living NPCs**: Cyber Thugs, Street Vendors, Giant Rats
- **ASCII Portraits**: Unique character art for each NPC type
- **Dynamic Dialogue**: 100+ contextual NPC barks

---

## 📖 Technical Documentation

For developers and AI agents, please refer to [AGENTS.md](./AGENTS.md). It contains:
- **Full System Architecture Diagram** (Mermaid)
- **Mental Model** of the engine and game loop
- **Golden Path Recipes** for adding items, NPCs, commands, and puzzles
- **Guardrails** for maintaining system stability

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Redis server
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/phobosd/Ourobouro.git
cd Ouroboro

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running the Game

**Terminal 1 - Start Redis:**
```bash
docker-compose up redis
```

**Terminal 2 - Start Server:**
```bash
cd server
npm run dev
```

**Terminal 3 - Start Client:**
```bash
cd client
npm run dev
```

Navigate to `http://localhost:5173` in your browser.

## 🎮 How to Play

For a comprehensive guide on commands, combat, and game mechanics, please refer to the [User's Guide](./docs/USERS_GUIDE.md).

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Socket.io-client
- **Backend**: Node.js + TypeScript + Socket.io
- **Database**: Redis (for persistence)
- **Architecture**: Entity Component System (ECS)

### Project Structure
```
Ouroboro/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   │   ├── Terminal.tsx
│   │   │   └── CombatOverlay.tsx
│   │   └── App.tsx
│   └── package.json
├── server/               # Node.js backend
│   ├── src/
│   │   ├── ecs/          # Entity Component System
│   │   ├── components/   # Game components
│   │   ├── systems/      # Game systems
│   │   ├── commands/     # Command registry
│   │   ├── world/        # World generation
│   │   └── persistence/  # Redis integration
│   └── package.json
└── docker-compose.yml    # Redis setup
```

## 🎨 Combat System Details

### Weapon Difficulty
Each weapon has a `SyncDifficulty` that affects the timing challenge:
```typescript
{
  speed: 1.2,      // Cursor movement speed
  zoneSize: 2,     // Base crit zone width
  jitter: 0.1      // Random jump chance (10%)
}
```

### Difficulty Scaling
- **Agility**: Higher AGI = wider crit zone
- **Skill Level**: Higher Marksmanship = slower cursor
- **Weapon Type**: Different weapons have different sync parameters

### System Breach Effects (Critical Hits)
1. **Neural Feedback** - Stuns target
2. **Optic Glitch** - Reduces target accuracy
3. **Armor Shred** - Permanent defense reduction
4. **Ammo Cook-off** - Fire damage over time
5. **Actuator Lock** - Reduces target agility

## 🛠️ Development

### Server Scripts
```bash
npm run dev      # Development with hot reload
npm run build    # Build for production
npm start        # Run production build
```

### Client Scripts
```bash
npm run dev      # Development server
npm run build    # Build for production
npm run preview  # Preview production build
```

### Utility Scripts
```bash
# Kill server process on port 3000 (Windows)
powershell -ExecutionPolicy Bypass -File server/kill_server.ps1
```

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 🎯 Roadmap

- [ ] Enemy AI and counter-attacks
- [ ] More weapon types and combat variations
- [ ] Crafting system
- [ ] Quest system
- [ ] Player-vs-Player combat
- [ ] Cybernetic augmentations
- [ ] Hacking mini-game
- [ ] Sound effects and music

---

**Built with ❤️ for the cyberpunk MUD renaissance**

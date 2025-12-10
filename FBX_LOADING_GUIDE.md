# FBX Character Loading - Implementation Guide

## What We Just Added

I've implemented a complete FBX character loading system for your Fantasy Roguelite game!

### ✅ New Features

1. **AssetLoader System** (`client/src/loaders/AssetLoader.js`)
   - Loads FBX models from your POLYGON Fantasy Kingdom pack
   - Applies texture atlases to models
   - Caches loaded assets for better performance
   - Handles errors gracefully with fallbacks

2. **Character Selection Screen** (`client/src/ui/CharacterSelector.js`)
   - Beautiful UI to choose your character
   - 4 playable characters: Knight, Mage, King, Peasant
   - Smooth animations and hover effects

3. **FBX Character Integration** (Updated `PlayerController.js`)
   - Loads actual 3D character models instead of placeholder shapes
   - Scales models correctly
   - Applies shadows and materials
   - Falls back to simple geometry if loading fails

### 📂 Assets Copied

The following files have been copied to `client/public/assets/`:

**Characters** (`/assets/characters/`):
- `SK_Chr_Soldier_Male_01.fbx` - Knight character
- `SK_Chr_Mage_01.fbx` - Mage character
- `SK_Chr_King_01.fbx` - King character
- `SK_Chr_Peasant_Male_01.fbx` - Peasant character

**Textures** (`/assets/textures/`):
- `PolygonFantasyKingdom_Texture_01_A.png`
- `PolygonFantasyKingdom_Texture_02_A.png`
- `PolygonFantasyKingdom_Texture_03_A.png`

## How It Works

### 1. Character Selection Flow

```
Game Starts
    ↓
Character Selection Screen Appears
    ↓
User Clicks a Character (Knight, Mage, King, or Peasant)
    ↓
Selection Screen Fades Out
    ↓
Game Loads with Selected Character
    ↓
FBX Model Loads from /assets/characters/
    ↓
Texture Applied from /assets/textures/
    ↓
Character Appears in 3D World!
```

### 2. Code Structure

**AssetLoader.js** - Handles all asset loading:
```javascript
// Load a character
const character = await assetLoader.loadCharacter('SK_Chr_Soldier_Male_01');

// Load with specific texture
const character = await assetLoader.loadFBX(
    '/assets/characters/SK_Chr_Mage_01.fbx',
    '/assets/textures/PolygonFantasyKingdom_Texture_01_A.png'
);
```

**PlayerController.js** - Uses loaded characters:
```javascript
async init(characterName = 'SK_Chr_Soldier_Male_01') {
    // Load FBX character model
    this.characterModel = await this.assetLoader.loadCharacter(characterName);

    // Add to scene
    this.mesh.add(this.characterModel);
}
```

**main.js** - Coordinates everything:
```javascript
// Show character selector first
showCharacterSelection();

// Then load game with selected character
await this.playerController.init(this.selectedCharacter);
```

## Testing Your Changes

### 1. Refresh Your Browser

Go to `http://localhost:5173` and you should see:

1. **Character Selection Screen** with 4 character cards:
   - ⚔️ Knight
   - 🧙 Mage
   - 👑 King
   - 🧑 Peasant

2. **Click a character** to select it

3. **Loading screen** shows "Creating player..."

4. **Your selected FBX character appears** in the 3D world!

### 2. Check Browser Console

Open browser console (F12) and look for:
```
Loading character: SK_Chr_Soldier_Male_01
Loading /assets/characters/SK_Chr_Soldier_Male_01.fbx: 100%
Character loaded successfully!
```

### 3. Troubleshooting

**If you see the placeholder capsule instead of character:**
- Check browser console for errors
- FBX models might need different scaling
- Textures might not be loading

**Common Issues:**

| Issue | Solution |
|-------|----------|
| Character too big/small | Adjust scale in `AssetLoader.js` line: `character.scale.set(0.01, 0.01, 0.01)` |
| Character not visible | Check Y position in `PlayerController.js` |
| Texture not applied | Verify texture path in `AssetLoader.js` |
| Loading fails | Check browser console, may need to copy more FBX files |

## Adding More Characters

Want to add more playable characters? Easy!

### 1. Copy More FBX Files

```bash
# From your assets folder
cp "POLYGON_Fantasy_Kingdom_SourceFiles_v4/Source_Files/Characters/SK_Chr_Blacksmith_Male_01.fbx" "client/public/assets/characters/"
```

### 2. Update Character List

Edit `client/src/ui/CharacterSelector.js`:

```javascript
this.characters = [
    { name: 'SK_Chr_Soldier_Male_01', display: 'Knight' },
    { name: 'SK_Chr_Mage_01', display: 'Mage' },
    { name: 'SK_Chr_King_01', display: 'King' },
    { name: 'SK_Chr_Peasant_Male_01', display: 'Peasant' },
    // Add new character here:
    { name: 'SK_Chr_Blacksmith_Male_01', display: 'Blacksmith' }
];
```

### 3. Add Icon (Optional)

```javascript
getCharacterIcon(displayName) {
    const icons = {
        'Knight': '⚔️',
        'Mage': '🧙',
        'King': '👑',
        'Peasant': '🧑',
        'Blacksmith': '🔨'  // Add new icon
    };
    return icons[displayName] || '🎮';
}
```

## Available Characters to Add

Your POLYGON Fantasy Kingdom pack includes these characters:

### Male Characters
- SK_Chr_Bartender_01
- SK_Chr_Blacksmith_Male_01
- SK_Chr_Headsman_01
- SK_Chr_Hermit_01
- SK_Chr_Jester_01
- SK_Chr_King_01
- SK_Chr_Mage_01
- SK_Chr_Merchant_01
- SK_Chr_Monk_01
- SK_Chr_Peasant_Male_01
- SK_Chr_Priest_01
- SK_Chr_Prince_01
- SK_Chr_Rider_01
- SK_Chr_Soldier_Male_01

### Female Characters
- SK_Chr_Blacksmith_Female_01
- SK_Chr_FortuneTeller_01
- SK_Chr_Nun_01
- SK_Chr_Peasant_Female_01
- SK_Chr_Princess_01
- SK_Chr_Queen_01
- SK_Chr_Soldier_Female_01

### Special
- SK_Chr_Fairy_01

## Next Steps

### 1. Load Building Assets

Copy some building FBX files and add them to the world:

```bash
# Copy a castle piece
cp "POLYGON_Fantasy_Kingdom_SourceFiles_v4/Source_Files/FBX/SM_Bld_Castle_Tower_01.fbx" "client/public/assets/buildings/"
```

Then load in `WorldManager.js`:
```javascript
const castle = await this.assetLoader.loadFBX(
    '/assets/buildings/SM_Bld_Castle_Tower_01.fbx',
    '/assets/textures/PolygonFantasyKingdom_Texture_01_A.png'
);
castle.position.set(10, 0, 10);
this.scene.add(castle);
```

### 2. Add Character Animations

FBX models may include animations. To use them:

```javascript
// In AssetLoader.js
async loadCharacter(characterName) {
    const character = await this.loadFBX(path, texturePath);

    // Check for animations
    if (character.animations && character.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(character);
        const action = mixer.clipAction(character.animations[0]);
        action.play();
        // Store mixer to update in game loop
    }

    return character;
}
```

### 3. Sync Character Selection in Multiplayer

Currently each player sees their own character. To sync selections:

**Client sends to server:**
```javascript
this.network.ws.send(JSON.stringify({
    type: 'selectCharacter',
    characterName: this.selectedCharacter
}));
```

**Server broadcasts to others:**
```javascript
broadcast({
    type: 'playerCharacter',
    playerId: playerId,
    characterName: message.characterName
});
```

## Performance Tips

1. **Preload Common Characters**
   ```javascript
   await assetLoader.preloadAssets([
       { type: 'fbx', path: '/assets/characters/SK_Chr_Soldier_Male_01.fbx', texture: '...' },
       { type: 'fbx', path: '/assets/characters/SK_Chr_Mage_01.fbx', texture: '...' }
   ]);
   ```

2. **Use LOD (Level of Detail)**
   - Create simpler versions of models for distant players
   - Switch between them based on camera distance

3. **Optimize Textures**
   - The texture atlases are already optimized!
   - All characters share the same textures
   - Reduces draw calls significantly

## Summary

You now have:
- ✅ FBX character loading system
- ✅ Character selection screen
- ✅ 4 playable characters
- ✅ Texture atlas support
- ✅ Error handling with fallbacks
- ✅ Caching for performance

**Your characters are ready to explore the fantasy kingdom!** 🎮⚔️

---

Need help adding more features? Check out the other documentation files!

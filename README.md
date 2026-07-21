# Nyumban Field Agent App

Nyumban Field Agent is an offline-first React Native application designed for property condition reporting in low-connectivity areas (e.g., stairwells, rural sites). Optimized for low-end hardware (2GB RAM), the app features resilient synchronization, version conflict management, and high-performance list rendering.

---

## 🚀 How to Run the Project

### Prerequisites
* **Node.js**: `>= 22.11.0`
* **JDK**: Zulu OpenJDK `17`
* **Android SDK**: NDK version `27.1.12297006`

### Setup & Build Steps
1. **Configure Environment Variables**:
   Open [src/config/constants.ts](file:///Users/mac/Desktop/projects/NyumbanFieldAgent/src/config/constants.ts) and ensure the `ASSESSMENT_KEY` contains your active `X-Assessment-Key`.

2. **Install Dependencies**:
   Ensure all compatible native package versions are synchronized:
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Bundling Assets (Android Vector Icons)**:
   Ensure Android icon asset copying is linked:
   ```bash
   cd android && ./gradlew clean && cd ..
   ```

4. **Launch Metro Server**:
   Start the Metro Bundler with a reset cache:
   ```bash
   npx react-native start --reset-cache
   ```

5. **Build and Run Android**:
   In another terminal tab, launch the Android build:
   ```bash
   npx react-native run-android
   ```

---

## 🛠️ Key Architectural Decisions & Rationale

### Phase 1: Native Dependencies & Architecture Compliance
* **Upgrade to compatible modern JSI packages**: Bootstrap packages were upgraded (e.g., `react-native-screens` to `^4.0.0`, `react-native-vision-camera` to `^4.5.2`, and `react-native-safe-area-context` to `^5.5.2`) to maintain compatibility with React Native `0.86.0` JSI internal upgrades (Yoga v3 and Choreographer deprecation).
* **Heap and ProGuard optimizations**: Set `largeHeap="true"` in the Android Manifest to prevent Out-Of-Memory (OOM) crashes on low-end 2GB RAM devices when uploading images. Configured database ProGuard rules to protect native WatermelonDB SQLite JSI hooks during minification.

### Phase 2: Database Layer (WatermelonDB)
* **Underlying Architecture**: Selected **WatermelonDB** over AsyncStorage or basic JSON stores because it utilizes a fast SQLite JSI adapter.
* **No Redux / Global State Renders**: Components directly subscribe to DB queries via query observations, eliminating global state re-render overhead. Relational schemas map `Property` $\rightarrow$ `Room` $\rightarrow$ `InspectionDraft` $\rightarrow$ `DraftRoom` $\rightarrow$ `LocalPhoto` lazily.

### Phase 3: Token Mutex Engine & Resilient Storage
* **Axios Mutex Interceptors**: Added atomic request/response queue locks. Concurrent API calls are suspended and queued if a token refresh is active, preventing redundant `/auth/refresh` sessions and token invalidation.
* **Synchronous MMKV with Memory Fallback**: Implemented MMKV for instantaneous access to keys on JSI threads. Configured a try-catch memory-based storage fallback to prevent JSI-disabled crashes during Chrome Remote Debugging.
* **Global Router Navigation Ref**: Integrated a headless navigation reference (`RootNavigation.ts`) so our network interceptor can force a session logout redirect to `LoginScreen` directly from JSI callbacks.

### Phase 4: Resilient Offline Outbox Synchronization
* **Sequential Outbox Processing**: Drafts are synced using a sequential loop to avoid memory spikes. 
* **Backoff & Quota Ceiling Handling**: 
  * Network requests are wrapped in an exponential backoff retry loop (covering transient `500` / `503` random API failures).
  * Storage quota limit `507` results in immediate halting, marking the draft as `failed` to prevent network thrashing.
* **Version Mismatch Resolution (409)**: On receiving a 409, the sync engine marks the local draft as `conflict_detected`, immediately writes the server's newer property state (rooms & labels) to the database, and halts the loop to trigger the Reconciliation comparison screen.

### Phase 5: UI Layer & Layout Optimization
* **Debounced Search Box**: A 200ms debounce window limits reactive SQLite query updates.
* **Debounced Uncontrolled Text Fields**: Room inspection notes are uncontrolled text fields with a 150ms debounced auto-save transaction to SQLite, eliminating input stuttering.
* **High-Performance List Rendering**: Used `@shopify/flash-list` with `estimatedItemSize={120}` for property directory rendering, recycling list cell components to conserve CPU cycles.
* **Web UI Branding**: Copied the web dashboard colors (Deep Navy `#002D40` and Accent Amber `#F39C12`) to align visual brand identity.

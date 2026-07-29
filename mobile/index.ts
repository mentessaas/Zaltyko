// expo-router uses `expo-router/entry` via package.json `main`. This file
// exists only as a typed re-export so editors can resolve the entrypoint.
// Antes de que cargue expo-router, silenciamos los warnings propios del
// simulador iOS sin provisioning real (ver lib/observability/silence-sim-warnings.ts).
import './lib/observability/silence-sim-warnings';

import 'expo-router/entry';
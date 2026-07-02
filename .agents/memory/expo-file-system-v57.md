---
name: expo-file-system v57 API
description: expo-file-system v57 (installed in this project) uses a completely different API from older versions — no cacheDirectory/writeAsStringAsync/EncodingType.
---

The project has expo-file-system@57 installed (newer than the Expo SDK 54 expected version ~19.x). This version has a class-based API:

```ts
import { File, Paths } from 'expo-file-system';

// Write bytes to cache, then share:
const bytes: Uint8Array = ...; // e.g. from XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
const file = new File(Paths.cache, `filename-${Date.now()}.xlsx`);
file.write(bytes);
await Sharing.shareAsync(file.uri, { mimeType: '...' });
```

**Why:** The old API (`FileSystem.cacheDirectory`, `writeAsStringAsync`, `EncodingType`) no longer exists in v57. The TypeScript compiler catches this immediately.

**How to apply:** Any time you need to write a file to disk then share it on native, use `new File(Paths.cache, name)` + `file.write(content)`. For web, use `XLSX.writeFile` or `window.URL.createObjectURL`.

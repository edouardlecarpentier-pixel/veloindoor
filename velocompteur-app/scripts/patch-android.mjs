// Ajuste le projet Android généré : permissions (Bluetooth, GPS en arrière-plan, notification), écran toujours allumé.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = readFileSync(manifestPath, 'utf8');
const extra = `
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
`;
if (!manifest.includes('FOREGROUND_SERVICE_LOCATION')) {
  manifest = manifest.replace('</manifest>', extra + '</manifest>');
  writeFileSync(manifestPath, manifest);
}
// Android 11+ : déclarer les applis de musique que l'on peut ouvrir
if (!manifest.includes('<queries>')) {
  const q = `
    <queries>
        <package android:name="com.spotify.music" />
        <package android:name="deezer.android.app" />
        <package android:name="com.google.android.apps.youtube.music" />
    </queries>
`;
  manifest = manifest.replace('</manifest>', q + '</manifest>');
  writeFileSync(manifestPath, manifest);
}

function findFile(dir, name) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { const r = findFile(p, name); if (r) return r; }
    else if (e === name) return p;
  }
  return null;
}
const main = findFile('android/app/src/main/java', 'MainActivity.java');
if (!main) throw new Error('MainActivity.java introuvable');
const pkg = readFileSync(main, 'utf8').match(/^package\s+([\w.]+);/m)[1];
writeFileSync(main, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
`);

// Nom de la notification GPS
const stringsPath = 'android/app/src/main/res/values/strings.xml';
let strings = readFileSync(stringsPath, 'utf8');
if (!strings.includes('capacitor_background_geolocation_notification_channel_name')) {
  strings = strings.replace('</resources>', '    <string name="capacitor_background_geolocation_notification_channel_name">Suivi de la sortie</string>\n</resources>');
  writeFileSync(stringsPath, strings);
}
console.log('Projet Android ajusté');
